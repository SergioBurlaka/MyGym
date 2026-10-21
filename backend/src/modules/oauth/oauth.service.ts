import crypto from 'node:crypto';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { apiTokens, oauthAuthorizationRequests, oauthGrants, oauthRefreshTokens } from '../../db/schema.js';
import { hashRefreshToken } from '../../utils/tokens.js';
import { OAuthClientError, redirectUriAllowed, resolveClient } from './cimd.client.js';
import {
  ACCESS_TOKEN_TTL_MS,
  AUTHORIZATION_CODE_TTL_MS,
  AUTHORIZATION_REQUEST_TTL_MS,
  ISSUER,
  MCP_RESOURCE,
  OAT_PREFIX,
  ORT_PREFIX,
  REFRESH_TOKEN_TTL_MS,
  SCOPE,
} from './oauth.config.js';

// An OAuth error in RFC 6749 terms. `redirect` = may be reported back to the
// client's redirect_uri; false = the client/redirect itself is untrusted,
// so the browser must NOT be sent there (shown on our page instead).
export class OAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public redirect = true,
  ) {
    super(description);
  }
}

const random = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

// ---------- /authorize ----------

export type AuthorizeParams = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
};

// Validates the client and redirect first: until both are trusted no error
// may be redirected anywhere (open-redirect / phishing via our domain).
export async function validateClientAndRedirect(params: AuthorizeParams) {
  if (!params.client_id || !params.redirect_uri) {
    throw new OAuthError('invalid_request', 'client_id and redirect_uri are required', false);
  }
  let client;
  try {
    client = await resolveClient(params.client_id);
  } catch (err) {
    const why = err instanceof OAuthClientError ? err.message : 'unknown client';
    throw new OAuthError('invalid_client', why, false);
  }
  if (!redirectUriAllowed(client, params.redirect_uri)) {
    throw new OAuthError('invalid_request', 'redirect_uri is not registered for this client', false);
  }
  return client;
}

// `browserSecret` is the /authorize cookie: the request can only be seen and
// answered from the browser that started it. Otherwise anyone could start a
// connection in their own Claude/ChatGPT account, send the consent link to
// a victim and get the victim's approval delivered to their connector.
export async function createAuthorizationRequest(params: AuthorizeParams, browserSecret: string) {
  const client = await validateClientAndRedirect(params);

  if (params.response_type !== 'code') {
    throw new OAuthError('unsupported_response_type', 'Only response_type=code is supported');
  }
  // PKCE is mandatory, and only S256 (plain would leak the verifier).
  if (!params.code_challenge || params.code_challenge_method !== 'S256') {
    throw new OAuthError('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge)) {
    throw new OAuthError('invalid_request', 'code_challenge must be a base64url SHA-256');
  }
  // RFC 8707: MCP clients send the MCP URL; anything else isn't ours.
  const resource = params.resource ?? MCP_RESOURCE;
  if (resource !== MCP_RESOURCE) {
    throw new OAuthError('invalid_target', `resource must be ${MCP_RESOURCE}`);
  }
  const requestedScopes = (params.scope ?? SCOPE).split(' ').filter(Boolean);
  if (requestedScopes.some((s) => s !== SCOPE)) {
    throw new OAuthError('invalid_scope', `Only the "${SCOPE}" scope is supported`);
  }

  // Housekeeping: a request (and its code) is dead within ~20 minutes.
  await db
    .delete(oauthAuthorizationRequests)
    .where(lt(oauthAuthorizationRequests.expiresAt, new Date(Date.now() - 60 * 60_000)));

  const [row] = await db
    .insert(oauthAuthorizationRequests)
    .values({
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUri: params.redirect_uri!,
      codeChallenge: params.code_challenge,
      state: params.state ?? null,
      resource,
      scope: SCOPE,
      browserHash: hashRefreshToken(browserSecret),
      expiresAt: new Date(Date.now() + AUTHORIZATION_REQUEST_TTL_MS),
    })
    .returning({ id: oauthAuthorizationRequests.id });
  return row.id;
}

// Where to send the browser back, with RFC 9207 `iss` on every response.
export function clientRedirect(redirectUri: string, params: Record<string, string | null | undefined>) {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries({ ...params, iss: ISSUER })) {
    if (v != null) url.searchParams.set(k, v);
  }
  return url.toString();
}

// ---------- consent ----------

function pendingRequest(id: string, browserSecret: string | undefined) {
  if (!browserSecret) return Promise.resolve(undefined);
  return db.query.oauthAuthorizationRequests.findFirst({
    where: and(
      eq(oauthAuthorizationRequests.id, id),
      eq(oauthAuthorizationRequests.browserHash, hashRefreshToken(browserSecret)),
      isNull(oauthAuthorizationRequests.userId),
      isNull(oauthAuthorizationRequests.usedAt),
      gt(oauthAuthorizationRequests.expiresAt, new Date()),
    ),
  });
}

// What the consent page shows. The redirect host is required by the MCP
// spec - it's how the user can tell a real client from an impostor.
export async function getConsentInfo(id: string, browserSecret: string | undefined) {
  const req = await pendingRequest(id, browserSecret);
  if (!req) return null;
  return {
    clientName: req.clientName,
    clientId: req.clientId,
    clientHost: new URL(req.clientId).hostname,
    redirectHost: new URL(req.redirectUri).host,
    scope: req.scope,
  };
}

// Returns the URL to send the browser to (code on approve, error on deny).
export async function decide(id: string, userId: string, approve: boolean, browserSecret: string | undefined) {
  const req = await pendingRequest(id, browserSecret);
  if (!req) return null;

  if (!approve) {
    await db.update(oauthAuthorizationRequests).set({ usedAt: new Date() }).where(eq(oauthAuthorizationRequests.id, id));
    return clientRedirect(req.redirectUri, {
      error: 'access_denied',
      error_description: 'The user denied access',
      state: req.state,
    });
  }

  const code = random();
  // Conditional on still-pending, so a double click can't mint two codes.
  const [updated] = await db
    .update(oauthAuthorizationRequests)
    .set({ userId, codeHash: hashRefreshToken(code), codeExpiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS) })
    .where(and(eq(oauthAuthorizationRequests.id, id), isNull(oauthAuthorizationRequests.userId)))
    .returning({ id: oauthAuthorizationRequests.id });
  if (!updated) return null;
  return clientRedirect(req.redirectUri, { code, state: req.state });
}

// ---------- /token ----------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function issueTokens(tx: Tx, grant: { id: string; userId: string; clientName: string; scope: string }) {
  const accessToken = OAT_PREFIX + random();
  const refreshToken = ORT_PREFIX + random();
  await tx.insert(apiTokens).values({
    userId: grant.userId,
    name: grant.clientName,
    tokenHash: hashRefreshToken(accessToken),
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    grantId: grant.id,
  });
  await tx.insert(oauthRefreshTokens).values({
    grantId: grant.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
    refresh_token: refreshToken,
    scope: grant.scope,
  };
}

function pkceMatches(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

export async function exchangeCode(params: {
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  client_id?: string;
  resource?: string;
}) {
  if (!params.code || !params.redirect_uri || !params.code_verifier || !params.client_id) {
    throw new OAuthError('invalid_request', 'code, redirect_uri, code_verifier and client_id are required');
  }
  return db.transaction(async (tx) => {
    // Single use: claim the code atomically; a replay finds nothing.
    const [req] = await tx
      .update(oauthAuthorizationRequests)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(oauthAuthorizationRequests.codeHash, hashRefreshToken(params.code!)),
          isNull(oauthAuthorizationRequests.usedAt),
          gt(oauthAuthorizationRequests.codeExpiresAt, new Date()),
        ),
      )
      .returning();
    if (!req?.userId) throw new OAuthError('invalid_grant', 'The authorization code is invalid, expired or used');
    if (req.clientId !== params.client_id || req.redirectUri !== params.redirect_uri) {
      throw new OAuthError('invalid_grant', 'client_id or redirect_uri does not match the authorization request');
    }
    if (!pkceMatches(params.code_verifier!, req.codeChallenge)) {
      throw new OAuthError('invalid_grant', 'code_verifier does not match the code_challenge');
    }
    if (params.resource && params.resource !== req.resource) {
      throw new OAuthError('invalid_target', 'resource does not match the authorization request');
    }

    const [grant] = await tx
      .insert(oauthGrants)
      .values({
        userId: req.userId,
        clientId: req.clientId,
        clientName: req.clientName,
        resource: req.resource,
        scope: req.scope,
        lastUsedAt: new Date(),
      })
      .returning();
    return issueTokens(tx, grant);
  });
}

export async function refresh(params: { refresh_token?: string; client_id?: string; resource?: string }) {
  if (!params.refresh_token || !params.client_id) {
    throw new OAuthError('invalid_request', 'refresh_token and client_id are required');
  }
  const tokenHash = hashRefreshToken(params.refresh_token);

  // Outcome of the transaction; reuse handling runs after it, so a thrown
  // error doesn't roll back the revocation.
  const result = await db.transaction(async (tx) => {
    const row = await tx.query.oauthRefreshTokens.findFirst({
      where: eq(oauthRefreshTokens.tokenHash, tokenHash),
      with: { grant: true },
    });
    if (!row || row.grant.revokedAt || row.expiresAt <= new Date()) return { error: 'invalid' as const };
    if (row.grant.clientId !== params.client_id) return { error: 'invalid' as const };
    if (params.resource && params.resource !== row.grant.resource) return { error: 'target' as const };

    // Rotation: claim it atomically. Already used = someone replays an old
    // refresh token - treat as theft (OAuth 2.1 / MCP spec).
    const [claimed] = await tx
      .update(oauthRefreshTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthRefreshTokens.id, row.id), isNull(oauthRefreshTokens.usedAt)))
      .returning({ id: oauthRefreshTokens.id });
    if (!claimed) return { error: 'reused' as const, grantId: row.grantId };

    await tx.update(oauthGrants).set({ lastUsedAt: new Date() }).where(eq(oauthGrants.id, row.grantId));
    // Housekeeping: every refresh adds a row to both tables. Expired ones
    // go; used-but-unexpired refresh tokens stay for replay detection.
    const now = new Date();
    await tx.delete(apiTokens).where(and(eq(apiTokens.grantId, row.grantId), lt(apiTokens.expiresAt, now)));
    await tx
      .delete(oauthRefreshTokens)
      .where(and(eq(oauthRefreshTokens.grantId, row.grantId), lt(oauthRefreshTokens.expiresAt, now)));
    return { tokens: await issueTokens(tx, row.grant) };
  });

  if ('tokens' in result) return result.tokens;
  if (result.error === 'reused') await revokeGrantById(result.grantId);
  if (result.error === 'target') throw new OAuthError('invalid_target', 'resource does not match the grant');
  throw new OAuthError('invalid_grant', 'The refresh token is invalid, expired or revoked');
}

// ---------- connected apps (Integrations) ----------

export async function listGrants(userId: string) {
  return db
    .select({
      id: oauthGrants.id,
      clientName: oauthGrants.clientName,
      clientId: oauthGrants.clientId,
      createdAt: oauthGrants.createdAt,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthGrants)
    .where(and(eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt)))
    .orderBy(desc(oauthGrants.createdAt));
}

async function revokeGrantById(grantId: string) {
  // revokedAt alone already stops its access tokens (authenticate joins the
  // grant) and refresh tokens; revoking the tokens too keeps the rows honest.
  await db.transaction(async (tx) => {
    await tx.update(oauthGrants).set({ revokedAt: new Date() }).where(eq(oauthGrants.id, grantId));
    await tx
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.grantId, grantId), isNull(apiTokens.revokedAt)));
  });
}

export async function revokeGrant(userId: string, id: string) {
  const grant = await db.query.oauthGrants.findFirst({
    where: and(eq(oauthGrants.id, id), eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt)),
  });
  if (!grant) return null;
  await revokeGrantById(grant.id);
  return { id: grant.id };
}
