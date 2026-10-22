import crypto from 'node:crypto';
import { and, eq, lt, notExists } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { oauthClients, oauthGrants } from '../../db/schema.js';
import { hashRefreshToken } from '../../utils/tokens.js';
import { redirectUriSchema, type OAuthClient } from './cimd.client.js';

// Dynamic Client Registration (RFC 7591) for clients that don't do CIMD
// (Gemini, editors, CLIs). Registration is open to anyone, so a registered
// client proves nothing about who it is: the consent screen marks it as
// unverified and shows where the code will go (the redirect host).

export const CLIENT_ID_PREFIX = 'mygym_cli_';
const CLIENT_SECRET_PREFIX = 'mygym_cls_';
// Registered but never connected by anyone - a probe or an abandoned try.
const UNUSED_CLIENT_TTL_MS = 7 * 24 * 60 * 60_000;

// CIMD client ids are https URLs; everything else can only be ours.
export const isRegisteredClientId = (clientId: string) => !clientId.startsWith('https://');

const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const;
type AuthMethod = (typeof AUTH_METHODS)[number];

// RFC 7591 error, answered as {error, error_description} with 400.
export class RegistrationError extends Error {
  constructor(
    public code: 'invalid_redirect_uri' | 'invalid_client_metadata',
    public description: string,
  ) {
    super(description);
  }
}

const metadataSchema = z.object({
  // Same rule as CIMD (https or loopback), plus no fragment (RFC 6749 3.1.2)
  // and no wildcard - redirects are matched exactly.
  redirect_uris: z
    .array(redirectUriSchema.refine((s) => !s.includes('#') && !s.includes('*')))
    .min(1)
    .max(10),
  // RFC 7591 default when omitted.
  token_endpoint_auth_method: z.enum(AUTH_METHODS).default('client_secret_basic'),
  grant_types: z
    .array(z.enum(['authorization_code', 'refresh_token']))
    // We always issue a refresh token along, so say so by default.
    .default(['authorization_code', 'refresh_token'])
    .refine((g) => g.includes('authorization_code')),
  response_types: z.array(z.literal('code')).default(['code']),
  client_name: z.string().trim().min(1).max(200).optional(),
  client_uri: z.string().optional(),
});

function httpsOrNull(value: string | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export async function registerClient(body: unknown) {
  const parsed = metadataSchema.safeParse(body);
  if (!parsed.success) {
    const badRedirect = parsed.error.issues.some((i) => i.path[0] === 'redirect_uris');
    throw badRedirect
      ? new RegistrationError('invalid_redirect_uri', 'redirect_uris must be https or loopback http URLs, without fragments or wildcards')
      : new RegistrationError('invalid_client_metadata', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  const meta = parsed.data;

  // Housekeeping, like expired tokens on issue: drop old clients nobody
  // ever connected, so open registration can't grow the table forever.
  await db
    .delete(oauthClients)
    .where(
      and(
        lt(oauthClients.createdAt, new Date(Date.now() - UNUSED_CLIENT_TTL_MS)),
        notExists(db.select({ id: oauthGrants.id }).from(oauthGrants).where(eq(oauthGrants.clientId, oauthClients.id))),
      ),
    );

  const clientId = CLIENT_ID_PREFIX + crypto.randomBytes(16).toString('hex');
  const secret = meta.token_endpoint_auth_method === 'none' ? null : CLIENT_SECRET_PREFIX + crypto.randomBytes(32).toString('hex');
  const clientName = meta.client_name ?? new URL(meta.redirect_uris[0]).host;

  const [row] = await db
    .insert(oauthClients)
    .values({
      id: clientId,
      clientSecretHash: secret ? hashRefreshToken(secret) : null,
      tokenEndpointAuthMethod: meta.token_endpoint_auth_method,
      clientName,
      clientUri: httpsOrNull(meta.client_uri),
      redirectUris: meta.redirect_uris,
    })
    .returning();

  return {
    client_id: clientId,
    // Shown once; only its hash is kept.
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    client_name: clientName,
    ...(row.clientUri ? { client_uri: row.clientUri } : {}),
    redirect_uris: meta.redirect_uris,
    grant_types: meta.grant_types,
    response_types: meta.response_types,
    token_endpoint_auth_method: meta.token_endpoint_auth_method,
  };
}

// A registered client in the same shape as a CIMD one, so the rest of the
// OAuth code doesn't care where a client came from.
export async function findRegisteredClient(clientId: string): Promise<(OAuthClient & { authMethod: AuthMethod; secretHash: string | null }) | null> {
  if (!clientId.startsWith(CLIENT_ID_PREFIX) || clientId.length > 100) return null;
  const row = await db.query.oauthClients.findFirst({ where: eq(oauthClients.id, clientId) });
  if (!row) return null;
  return {
    clientId: row.id,
    clientName: row.clientName,
    logoUri: null, // written by whoever registered - not shown
    redirectUris: row.redirectUris,
    authMethod: row.tokenEndpointAuthMethod as AuthMethod,
    secretHash: row.clientSecretHash,
  };
}

// Token endpoint client authentication. CIMD clients are public (PKCE
// only); a registered confidential client must present its secret.
// Returns false when the client is unknown or the secret is missing/wrong.
export async function clientAuthenticates(clientId: string, secret: string | undefined): Promise<boolean> {
  if (!isRegisteredClientId(clientId)) return true;
  const client = await findRegisteredClient(clientId);
  if (!client) return false;
  if (client.authMethod === 'none') return true;
  if (!secret || !client.secretHash) return false;
  const given = Buffer.from(hashRefreshToken(secret));
  const stored = Buffer.from(client.secretHash);
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
}
