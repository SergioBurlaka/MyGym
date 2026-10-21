import type { FastifyInstance, FastifyRequest } from 'fastify';
import { registerSchema, loginSchema } from './auth.schema.js';
import {
  registerUser,
  validateCredentials,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  loginWithGoogle,
  AuthError,
} from './auth.service.js';
import { createGoogleAuthRequest, exchangeCodeForProfile, isGoogleEnabled } from './google.client.js';
import { refreshTtlToDate } from '../../utils/tokens.js';

const REFRESH_COOKIE = 'mygym_refresh';
// "<state>.<PKCE verifier>" for the Google round trip (state is hex, so the
// first dot is the separator).
const GOOGLE_FLOW_COOKIE = 'mygym_google_flow';
const GOOGLE_FLOW_PATH = '/api/auth/google';

// Per-IP throttling for the two endpoints that verify a password (argon2 is
// deliberately slow, so these are also the cheapest way to load the CPU).
// 10 logins/min is far above what a human mistyping needs, far below what
// a password-guessing script wants.
export const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };
export const REGISTER_RATE_LIMIT = { max: 5, timeWindow: '15 minutes' };
// Each Google round trip hits our server twice (start + callback).
export const GOOGLE_RATE_LIMIT = { max: 20, timeWindow: '1 minute' };

// Persistent (maxAge) rather than a session cookie: mobile browsers drop
// session cookies when they kill a backgrounded tab mid-workout. `secure`
// follows the actual scheme (X-Forwarded-Proto from nginx) - browsers silently
// discard Secure cookies set over HTTP, which broke refresh entirely back when
// prod nginx was plain HTTP; dev still is.
function cookieOptions(request: FastifyRequest) {
  return {
    path: '/api/auth',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.protocol === 'https',
    maxAge: Math.floor((refreshTtlToDate().getTime() - Date.now()) / 1000),
  };
}

// Only lives for the trip to Google and back. `lax` is what lets it ride
// along on Google's top-level redirect to the callback.
function googleFlowCookieOptions(request: FastifyRequest) {
  return {
    path: GOOGLE_FLOW_PATH,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.protocol === 'https',
    maxAge: 10 * 60,
  };
}

const googleDisabled = { error: 'google_disabled', message: 'Google sign-in is not configured' };

export default async function authRoutes(fastify: FastifyInstance) {
  // Which sign-in methods the login page should offer.
  fastify.get('/providers', async () => ({ google: isGoogleEnabled() }));

  fastify.get('/google', { config: { rateLimit: GOOGLE_RATE_LIMIT } }, async (request, reply) => {
    if (!isGoogleEnabled()) return reply.code(404).send(googleDisabled);

    const { url, state, codeVerifier } = await createGoogleAuthRequest();
    reply.setCookie(GOOGLE_FLOW_COOKIE, `${state}.${codeVerifier}`, googleFlowCookieOptions(request));
    return reply.redirect(url);
  });

  // Google sends the browser back here. Every outcome is a redirect: the
  // user is mid-navigation, not in a fetch, so errors go to the login page
  // as ?error=<code> (translated there via errors.<code>).
  fastify.get('/google/callback', { config: { rateLimit: GOOGLE_RATE_LIMIT } }, async (request, reply) => {
    if (!isGoogleEnabled()) return reply.code(404).send(googleDisabled);

    const query = request.query as { code?: string; state?: string; error?: string };
    const flow = request.cookies?.[GOOGLE_FLOW_COOKIE] ?? '';
    reply.clearCookie(GOOGLE_FLOW_COOKIE, { path: GOOGLE_FLOW_PATH });
    const fail = (code: string) => reply.redirect(`/login?error=${code}`);

    // e.g. access_denied when the user closes Google's account chooser.
    if (query.error) return fail('google_cancelled');

    const dot = flow.indexOf('.');
    const expectedState = dot > 0 ? flow.slice(0, dot) : '';
    const codeVerifier = dot > 0 ? flow.slice(dot + 1) : '';
    if (!query.code || !query.state || !expectedState || query.state !== expectedState) {
      return fail('google_state_mismatch');
    }

    let profile;
    try {
      profile = await exchangeCodeForProfile(query.code, codeVerifier);
    } catch (err) {
      request.log.warn({ err }, 'Google code exchange failed');
      return fail('google_failed');
    }

    try {
      const user = await loginWithGoogle(profile);
      const { refreshToken } = await issueTokenPair(user);
      // Same session cookie as a password login; the SPA picks it up with
      // its usual refresh on load.
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions(request));
      return reply.redirect('/');
    } catch (err) {
      if (err instanceof AuthError) return fail(err.code);
      throw err;
    }
  });

  fastify.post('/register', { config: { rateLimit: REGISTER_RATE_LIMIT } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }

    try {
      const user = await registerUser(parsed.data.email, parsed.data.password);
      const { accessToken, refreshToken } = await issueTokenPair(user);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions(request));
      return reply.code(201).send({ accessToken, user: { id: user.id, email: user.email } });
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(409).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  fastify.post('/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }

    try {
      const user = await validateCredentials(parsed.data.email, parsed.data.password);
      const { accessToken, refreshToken } = await issueTokenPair(user);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions(request));
      return reply.send({ accessToken, user: { id: user.id, email: user.email } });
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(401).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  fastify.post('/refresh', async (request, reply) => {
    const rawToken = request.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      return reply.code(401).send({ error: 'missing_refresh_token', message: 'No active session' });
    }

    try {
      const { accessToken, refreshToken } = await rotateRefreshToken(rawToken);
      reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions(request));
      return reply.send({ accessToken });
    } catch (err) {
      if (err instanceof AuthError) {
        reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
        return reply.code(401).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  fastify.post('/logout', async (request, reply) => {
    const rawToken = request.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      await revokeRefreshToken(rawToken);
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return reply.send({ ok: true });
  });
}
