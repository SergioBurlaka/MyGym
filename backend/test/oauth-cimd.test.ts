import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OAuthClientError,
  clearClientCache,
  parseClientIdUrl,
  redirectUriAllowed,
  resolveClient,
} from '../src/modules/oauth/cimd.client.js';

const CLIENT_ID = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const doc = (overrides: Record<string, unknown> = {}) => ({
  client_id: CLIENT_ID,
  client_name: 'Claude',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  token_endpoint_auth_method: 'none',
  ...overrides,
});

function stubFetch(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const fetchMock = vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: init.status ?? 200, headers: init.headers }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearClientCache();
});

describe('which client ids are even considered', () => {
  it.each([
    ['http (not https)', 'http://claude.ai/oauth/client'],
    ['a host outside the allow-list', 'https://evil.example/oauth/client'],
    ['a look-alike host', 'https://claude.ai.evil.example/oauth/client'],
    ['credentials in the URL', 'https://user:pw@claude.ai/oauth/client'],
    ['no path', 'https://claude.ai/'],
    ['not a URL', 'claude'],
  ])('rejects %s without fetching', async (_label, clientId) => {
    const fetchMock = stubFetch(doc());
    expect(() => parseClientIdUrl(clientId)).toThrow(OAuthClientError);
    await expect(resolveClient(clientId)).rejects.toThrow(OAuthClientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('resolving a metadata document', () => {
  it('returns name and redirect URIs, without following redirects', async () => {
    const fetchMock = stubFetch(doc());
    const client = await resolveClient(CLIENT_ID);
    expect(client).toEqual({ clientId: CLIENT_ID, clientName: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'] });
    const calls = fetchMock.mock.calls as unknown as [URL, RequestInit][];
    expect(calls[0][1].redirect).toBe('manual');
  });

  it.each([
    ['a client_id that differs from its URL', doc({ client_id: 'https://claude.ai/oauth/other' })],
    ['no redirect URIs', doc({ redirect_uris: [] })],
    ['a shared secret auth method', doc({ token_endpoint_auth_method: 'client_secret_post' })],
    ['invalid JSON', 'not json'],
    ['an oversized document', doc({ client_name: 'x'.repeat(200), padding: 'y'.repeat(6000) })],
  ])('rejects %s', async (_label, body) => {
    stubFetch(body);
    await expect(resolveClient(CLIENT_ID)).rejects.toThrow(OAuthClientError);
  });

  it('rejects a non-200 answer (including a redirect)', async () => {
    stubFetch('', { status: 302, headers: { location: 'https://evil.example/' } });
    await expect(resolveClient(CLIENT_ID)).rejects.toThrow(/302/);
  });

  it('caches a good document but never an error', async () => {
    let fetchMock = stubFetch('nope', { status: 500 });
    await expect(resolveClient(CLIENT_ID)).rejects.toThrow();
    fetchMock = stubFetch(doc(), { headers: { 'cache-control': 'max-age=60' } });
    await resolveClient(CLIENT_ID);
    await resolveClient(CLIENT_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a no-store document', async () => {
    const fetchMock = stubFetch(doc(), { headers: { 'cache-control': 'no-store' } });
    await resolveClient(CLIENT_ID);
    await resolveClient(CLIENT_ID);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('redirect URI matching', () => {
  const client = {
    clientId: CLIENT_ID,
    clientName: 'Claude',
    redirectUris: ['https://claude.ai/api/mcp/auth_callback', 'http://localhost/callback', 'http://127.0.0.1/callback'],
  };

  it('requires an exact match for normal URIs', () => {
    expect(redirectUriAllowed(client, 'https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(redirectUriAllowed(client, 'https://claude.ai/api/mcp/auth_callback/')).toBe(false);
    expect(redirectUriAllowed(client, 'https://claude.ai/api/mcp/auth_callback?x=1')).toBe(false);
    expect(redirectUriAllowed(client, 'https://evil.example/api/mcp/auth_callback')).toBe(false);
  });

  it('ignores only the port for loopback redirects (Claude Code)', () => {
    expect(redirectUriAllowed(client, 'http://localhost:53682/callback')).toBe(true);
    expect(redirectUriAllowed(client, 'http://127.0.0.1:9999/callback')).toBe(true);
    expect(redirectUriAllowed(client, 'http://localhost:53682/other')).toBe(false);
    expect(redirectUriAllowed(client, 'http://evil.example:53682/callback')).toBe(false);
  });
});
