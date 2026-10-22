import { parseClientIdUrl } from './cimd.client.js';
import { fetchFavicon, type ClientIcon } from './clientIcon.client.js';

// Fallback icon for a connected app that published no logo_uri: the
// favicon of its client_id host, fetched once and kept in memory. Misses
// are cached too (shorter), so a missing icon isn't refetched per page view.
const HIT_TTL_MS = 24 * 60 * 60_000;
const MISS_TTL_MS = 60 * 60_000;

const cache = new Map<string, { icon: ClientIcon | null; until: number }>();

// Throws OAuthClientError for a client_id outside OAUTH_CLIENT_HOSTS.
export async function getClientFavicon(clientId: string): Promise<ClientIcon | null> {
  const host = parseClientIdUrl(clientId).hostname.toLowerCase();
  const cached = cache.get(host);
  if (cached && cached.until > Date.now()) return cached.icon;

  const icon = await fetchFavicon(host);
  cache.set(host, { icon, until: Date.now() + (icon ? HIT_TTL_MS : MISS_TTL_MS) });
  return icon;
}

// Tests only.
export function clearClientIconCache() {
  cache.clear();
}
