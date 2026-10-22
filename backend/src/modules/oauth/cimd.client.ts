import { z } from 'zod';
import { env } from '../../config/env.js';

// Client ID Metadata Documents (CIMD): an OAuth client's client_id is an
// https URL serving its metadata (name, redirect URIs). Claude and ChatGPT
// use this instead of registering with us. Isolated here so tests can mock
// the network, like google.client.ts.

export class OAuthClientError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type OAuthClient = {
  clientId: string;
  clientName: string;
  logoUri: string | null;
  redirectUris: string[];
};

const FETCH_TIMEOUT_MS = 5_000;
const MAX_DOCUMENT_BYTES = 5 * 1024;
const DEFAULT_CACHE_MS = 5 * 60_000;
const MAX_CACHE_MS = 60 * 60_000;

const isLoopback = (u: URL) => u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');

// https, or http on loopback (RFC 8252) - never javascript:/data: and the
// like: the consent page sends the browser to this URI.
export const redirectUriSchema = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return u.protocol === 'https:' || isLoopback(u);
  });

const documentSchema = z.object({
  client_id: z.string(),
  client_name: z.string().min(1).max(200),
  redirect_uris: z.array(redirectUriSchema).min(1),
  token_endpoint_auth_method: z.string().optional(),
  logo_uri: z.unknown().optional(),
});

// The browser loads the logo straight from this URL, so only plain https -
// never http (mixed content) or javascript:/data:. A bad logo is dropped
// rather than failing the whole client: it is decoration, not identity.
export function safeLogoUri(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return url.href;
}

const cache = new Map<string, { client: OAuthClient; until: number }>();

// Only https URLs on allow-listed hosts (OAUTH_CLIENT_HOSTS). That keeps
// this fetch away from internal addresses (SSRF) and stops a random site
// from posing as a client on our consent screen.
export function parseClientIdUrl(clientId: string): URL {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new OAuthClientError('client_id must be a URL');
  }
  // A port would let client_id point at any service on an allowed host.
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.pathname === '/') {
    throw new OAuthClientError('client_id must be an https URL with a path');
  }
  if (!env.OAUTH_CLIENT_HOSTS.includes(url.hostname.toLowerCase())) {
    throw new OAuthClientError(`client host ${url.hostname} is not allowed`);
  }
  return url;
}

function cacheMs(cacheControl: string | null): number {
  if (cacheControl && /no-store|no-cache/.test(cacheControl)) return 0;
  const maxAge = /max-age=(\d+)/.exec(cacheControl ?? '')?.[1];
  return Math.min(maxAge ? Number(maxAge) * 1000 : DEFAULT_CACHE_MS, MAX_CACHE_MS);
}

export async function resolveClient(clientId: string): Promise<OAuthClient> {
  const cached = cache.get(clientId);
  if (cached && cached.until > Date.now()) return cached.client;

  const url = parseClientIdUrl(clientId);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'manual', // the spec forbids following redirects
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new OAuthClientError('could not fetch the client metadata document');
  }
  if (res.status !== 200) {
    throw new OAuthClientError(`client metadata document answered ${res.status}`);
  }
  // Refuse a declared-too-large body before reading it; the length is
  // checked again after, for responses that don't declare one.
  if (Number(res.headers.get('content-length') ?? 0) > MAX_DOCUMENT_BYTES) {
    await res.body?.cancel();
    throw new OAuthClientError('client metadata document is too large');
  }
  const text = await res.text();
  if (Buffer.byteLength(text) > MAX_DOCUMENT_BYTES) {
    throw new OAuthClientError('client metadata document is too large');
  }

  let parsed;
  try {
    parsed = documentSchema.safeParse(JSON.parse(text));
  } catch {
    throw new OAuthClientError('client metadata document is not JSON');
  }
  if (!parsed.success) throw new OAuthClientError('client metadata document is invalid');
  const doc = parsed.data;
  if (doc.client_id !== clientId) {
    throw new OAuthClientError('client_id in the document does not match its URL');
  }
  // Shared secrets make no sense in a public document (CIMD forbids them).
  if (doc.token_endpoint_auth_method?.startsWith('client_secret')) {
    throw new OAuthClientError('client metadata document uses a shared secret');
  }

  const client = { clientId, clientName: doc.client_name, logoUri: safeLogoUri(doc.logo_uri), redirectUris: doc.redirect_uris };
  const ttl = cacheMs(res.headers.get('cache-control'));
  if (ttl > 0) cache.set(clientId, { client, until: Date.now() + ttl });
  return client;
}

// Exact match, except loopback redirects (Claude Code's local callback),
// where the port is chosen at runtime - RFC 8252 section 7.3.
export function redirectUriAllowed(client: OAuthClient, redirectUri: string): boolean {
  if (client.redirectUris.includes(redirectUri)) return true;
  let requested: URL;
  try {
    requested = new URL(redirectUri);
  } catch {
    return false;
  }
  if (!isLoopback(requested)) return false;
  return client.redirectUris.some((registered) => {
    const r = new URL(registered);
    return isLoopback(r) && r.hostname === requested.hostname && r.pathname === requested.pathname && r.search === requested.search;
  });
}

// Tests only.
export function clearClientCache() {
  cache.clear();
}
