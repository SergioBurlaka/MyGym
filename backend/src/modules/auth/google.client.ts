import crypto from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';

// Everything that talks to Google lives here, so tests can vi.mock this one
// module instead of the network.

export type GoogleProfile = {
  sub: string; // Google's stable account id
  email: string;
  emailVerified: boolean;
};

export function isGoogleEnabled(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function createClient() {
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  });
}

// `state` ties the callback to the browser that started the flow (CSRF);
// the PKCE verifier ties the authorization code to it, so an intercepted
// code is useless on its own. Both go into a short-lived httpOnly cookie.
export async function createGoogleAuthRequest() {
  const client = createClient();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = crypto.randomBytes(24).toString('hex');
  const url = client.generateAuthUrl({
    // Only what sign-in needs: the account id and a verified email.
    scope: ['openid', 'email'],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: 'select_account',
  });
  return { url, state, codeVerifier: codeVerifier! };
}

export async function exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile> {
  const client = createClient();
  const { tokens } = await client.getToken({ code, codeVerifier });
  if (!tokens.id_token) {
    throw new Error('Google token response has no id_token');
  }
  // Checks the signature against Google's keys, the issuer, expiry and that
  // the token was issued for *our* client id.
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Google id_token has no sub/email');
  }
  return { sub: payload.sub, email: payload.email, emailVerified: payload.email_verified === true };
}
