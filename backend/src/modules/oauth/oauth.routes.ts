import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import formbody from '@fastify/formbody';
import { z } from 'zod';
import { requireSession } from '../../plugins/authenticate.js';
import {
  OAuthError,
  clientRedirect,
  createAuthorizationRequest,
  decide,
  exchangeCode,
  getConsentInfo,
  listGrants,
  refresh,
  revokeGrant,
  type AuthorizeParams,
} from './oauth.service.js';
import { OAuthClientError } from './cimd.client.js';
import { getClientFavicon } from './clientIcon.service.js';
import { RegistrationError, isRegisteredClientId, registerClient } from './dcr.service.js';

export const AUTHORIZE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };
export const TOKEN_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };
export const CLIENT_ICON_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };
export const REGISTER_RATE_LIMIT = { max: 10, timeWindow: '1 hour' };

const CONSENT_PAGE = '/oauth/consent';

// Ties an authorization request to the browser that started it (see
// createAuthorizationRequest). One per browser, shared by parallel requests
// (connecting Claude and ChatGPT at once); `lax` so it is set on the
// top-level navigation from the client and sent by the SPA's same-origin XHR.
const BROWSER_COOKIE = 'mygym_oauth_browser';
const BROWSER_COOKIE_PATH = '/api/oauth';

function browserCookieOptions(request: FastifyRequest) {
  return {
    path: BROWSER_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.protocol === 'https',
    maxAge: 10 * 60,
  };
}

const browserSecretOf = (request: FastifyRequest) => {
  const value = request.cookies?.[BROWSER_COOKIE];
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
};

// A repeated parameter (?state=a&state=b) arrives as an array; OAuth
// parameters are single strings, so anything else is invalid_request.
function onlyStrings(input: unknown): Record<string, string | undefined> | null {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries((input ?? {}) as Record<string, unknown>)) {
    if (typeof v !== 'string') return null;
    out[k] = v;
  }
  return out;
}

// RFC 6749 2.3.1 client_secret_basic: base64(urlencode(id):urlencode(secret)).
// undefined = no Basic header; null = a malformed one.
function basicCredentials(header: string | undefined): { clientId: string; secret: string } | null | undefined {
  if (!header?.toLowerCase().startsWith('basic ')) return undefined;
  const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 1) return null;
  try {
    return { clientId: decodeURIComponent(decoded.slice(0, colon)), secret: decodeURIComponent(decoded.slice(colon + 1)) };
  } catch {
    return null;
  }
}

// MyGym as an OAuth authorization server for MCP clients (Claude, ChatGPT).
// Flow: /authorize (browser) -> consent page in the SPA -> decision (API,
// logged-in session) -> back to the client with a code -> /token.
export default async function oauthRoutes(fastify: FastifyInstance) {
  // /token is application/x-www-form-urlencoded, as OAuth requires.
  fastify.register(formbody);

  fastify.get('/authorize', { config: { rateLimit: AUTHORIZE_RATE_LIMIT } }, async (request, reply) => {
    const params = onlyStrings(request.query) as AuthorizeParams | null;
    if (!params) return reply.redirect(`${CONSENT_PAGE}?error=invalid_request`);
    try {
      const browserSecret = browserSecretOf(request) ?? crypto.randomBytes(32).toString('base64url');
      const id = await createAuthorizationRequest(params, browserSecret);
      reply.setCookie(BROWSER_COOKIE, browserSecret, browserCookieOptions(request));
      return reply.redirect(`${CONSENT_PAGE}?request=${id}`);
    } catch (err) {
      if (!(err instanceof OAuthError)) throw err;
      // Unknown client / unregistered redirect: never redirect to it - show
      // the error on our own page instead. Same for a self-registered client:
      // anyone can register any https redirect, so redirecting its errors
      // (a broken response_type, before any login) would make our domain an
      // open redirect.
      if (!err.redirect || isRegisteredClientId(params.client_id ?? '')) {
        request.log.warn({ code: err.code, description: err.description }, 'OAuth authorize rejected');
        return reply.redirect(`${CONSENT_PAGE}?error=${err.code}`);
      }
      // A redirectable error means the client and redirect_uri already passed
      // validation (it runs first): report there.
      return reply.redirect(
        clientRedirect(params.redirect_uri!, { error: err.code, error_description: err.description, state: params.state }),
      );
    }
  });

  // The consent page's API: the person, logged in, in the browser - never a
  // token-holding program (a leaked token must not approve more access).
  fastify.register(async (consent) => {
    consent.addHook('preHandler', consent.authenticate);
    consent.addHook('preHandler', requireSession);

    consent.get<{ Params: { id: string } }>('/requests/:id', async (request, reply) => {
      const info = await getConsentInfo(request.params.id, browserSecretOf(request));
      if (!info) return reply.code(404).send({ error: 'oauth_request_expired' });
      return info;
    });

    consent.post<{ Params: { id: string } }>('/requests/:id/decision', async (request, reply) => {
      const parsed = z.object({ approve: z.boolean() }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
      const redirectTo = await decide(request.params.id, request.userId, parsed.data.approve, browserSecretOf(request));
      if (!redirectTo) return reply.code(404).send({ error: 'oauth_request_expired' });
      return { redirectTo };
    });

    consent.get('/grants', async (request) => listGrants(request.userId));

    consent.delete<{ Params: { id: string } }>('/grants/:id', async (request, reply) => {
      const revoked = await revokeGrant(request.userId, request.params.id);
      if (!revoked) return reply.code(404).send({ error: 'not_found' });
      return { ok: true };
    });
  });

  // Favicon of a connected app's host, for apps without a logo_uri. Public:
  // an <img> can't send the Bearer token, and the icon is no user data.
  // Only allow-listed client hosts, so this is no general-purpose proxy.
  fastify.get('/client-icon', { config: { rateLimit: CLIENT_ICON_RATE_LIMIT } }, async (request, reply) => {
    const parsed = z.object({ client_id: z.string().max(2048) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    let icon;
    try {
      icon = await getClientFavicon(parsed.data.client_id);
    } catch (err) {
      if (err instanceof OAuthClientError) return reply.code(400).send({ error: 'invalid_client' });
      throw err;
    }
    reply.header('x-content-type-options', 'nosniff').header('content-security-policy', "default-src 'none'");
    if (!icon) return reply.code(404).header('cache-control', 'public, max-age=3600').send({ error: 'not_found' });
    return reply.header('cache-control', 'public, max-age=86400').type(icon.contentType).send(icon.body);
  });

  // RFC 7591 Dynamic Client Registration - open, for MCP clients that don't
  // do CIMD (Gemini...). Called server-side, so no CORS.
  fastify.post('/register', { config: { rateLimit: REGISTER_RATE_LIMIT } }, async (request, reply) => {
    reply.header('cache-control', 'no-store');
    try {
      const client = await registerClient(request.body);
      // Who registers how is still unknown for some clients (Gemini) - keep
      // it in the log. Never the secret.
      request.log.info(
        { clientId: client.client_id, clientName: client.client_name, redirectUris: client.redirect_uris, authMethod: client.token_endpoint_auth_method },
        'oauth client registered',
      );
      return reply.code(201).send(client);
    } catch (err) {
      if (!(err instanceof RegistrationError)) throw err;
      return reply.code(400).send({ error: err.code, error_description: err.description });
    }
  });

  // RFC 6749 token endpoint: JSON errors {error, error_description}, never
  // cached. Clients call it server-side; CORS only for browser-based ones.
  fastify.post('/token', { config: { rateLimit: TOKEN_RATE_LIMIT } }, async (request, reply) => {
    reply.header('cache-control', 'no-store').header('access-control-allow-origin', '*');
    const body = onlyStrings(request.body);
    try {
      if (!body) throw new OAuthError('invalid_request', 'Every parameter must be a single string');
      const basic = basicCredentials(request.headers.authorization);
      if (basic === null) throw new OAuthError('invalid_client', 'Malformed Basic credentials');
      if (basic) {
        // One authentication method per request (RFC 6749 2.3).
        if (body.client_secret || (body.client_id && body.client_id !== basic.clientId)) {
          throw new OAuthError('invalid_request', 'Use either Basic credentials or client_secret in the body');
        }
        body.client_id = basic.clientId;
        body.client_secret = basic.secret;
      }
      if (body.grant_type === 'authorization_code') return await exchangeCode(body);
      if (body.grant_type === 'refresh_token') return await refresh(body);
      throw new OAuthError('unsupported_grant_type', 'Only authorization_code and refresh_token are supported');
    } catch (err) {
      if (!(err instanceof OAuthError)) throw err;
      // invalid_client is 401 (RFC 6749 5.2), with a challenge when the
      // client tried Basic.
      if (err.code === 'invalid_client' && request.headers.authorization?.toLowerCase().startsWith('basic ')) {
        reply.header('www-authenticate', 'Basic realm="mygym"');
      }
      return reply.code(err.code === 'invalid_client' ? 401 : 400).send({ error: err.code, error_description: err.description });
    }
  });
}
