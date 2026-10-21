import type { FastifyInstance } from 'fastify';
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
  validateClientAndRedirect,
  type AuthorizeParams,
} from './oauth.service.js';

export const AUTHORIZE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };
export const TOKEN_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

const CONSENT_PAGE = '/oauth/consent';

// MyGym as an OAuth authorization server for MCP clients (Claude, ChatGPT).
// Flow: /authorize (browser) -> consent page in the SPA -> decision (API,
// logged-in session) -> back to the client with a code -> /token.
export default async function oauthRoutes(fastify: FastifyInstance) {
  // /token is application/x-www-form-urlencoded, as OAuth requires.
  fastify.register(formbody);

  fastify.get('/authorize', { config: { rateLimit: AUTHORIZE_RATE_LIMIT } }, async (request, reply) => {
    const params = request.query as AuthorizeParams;
    try {
      const id = await createAuthorizationRequest(params);
      return reply.redirect(`${CONSENT_PAGE}?request=${id}`);
    } catch (err) {
      if (!(err instanceof OAuthError)) throw err;
      // Unknown client / unregistered redirect: never redirect to it - show
      // the error on our own page instead.
      if (!err.redirect) {
        request.log.warn({ code: err.code, description: err.description }, 'OAuth authorize rejected');
        return reply.redirect(`${CONSENT_PAGE}?error=${err.code}`);
      }
      // Client and redirect are trusted (validated first): report there.
      await validateClientAndRedirect(params);
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
      const info = await getConsentInfo(request.params.id);
      if (!info) return reply.code(404).send({ error: 'oauth_request_expired' });
      return info;
    });

    consent.post<{ Params: { id: string } }>('/requests/:id/decision', async (request, reply) => {
      const parsed = z.object({ approve: z.boolean() }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
      const redirectTo = await decide(request.params.id, request.userId, parsed.data.approve);
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

  // RFC 6749 token endpoint: JSON errors {error, error_description}, never
  // cached. Clients call it server-side; CORS only for browser-based ones.
  fastify.post('/token', { config: { rateLimit: TOKEN_RATE_LIMIT } }, async (request, reply) => {
    reply.header('cache-control', 'no-store').header('access-control-allow-origin', '*');
    const body = (request.body ?? {}) as Record<string, string | undefined>;
    try {
      if (body.grant_type === 'authorization_code') return await exchangeCode(body);
      if (body.grant_type === 'refresh_token') return await refresh(body);
      throw new OAuthError('unsupported_grant_type', 'Only authorization_code and refresh_token are supported');
    } catch (err) {
      if (!(err instanceof OAuthError)) throw err;
      return reply.code(400).send({ error: err.code, error_description: err.description });
    }
  });
}
