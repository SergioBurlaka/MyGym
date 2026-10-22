import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { clearClientIconCache } from '../src/modules/oauth/clientIcon.service.js';
import { createTestApp } from './helpers.js';

// The route tests replace only the network fetch; the real fetchFavicon is
// tested on its own below against a stubbed global fetch.
const net = vi.hoisted(() => ({ fetchFavicon: vi.fn() }));
vi.mock('../src/modules/oauth/clientIcon.client.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchFavicon: net.fetchFavicon,
}));

const CLAUDE = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let app: FastifyInstance;

beforeEach(async () => {
  vi.resetAllMocks();
  clearClientIconCache();
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const icon = (clientId?: string) =>
  app.inject({
    method: 'GET',
    url: `/api/oauth/client-icon${clientId === undefined ? '' : `?${new URLSearchParams({ client_id: clientId })}`}`,
  });

describe('GET /api/oauth/client-icon', () => {
  it("serves the client host's favicon without a login, cacheable and locked down", async () => {
    net.fetchFavicon.mockResolvedValue({ contentType: 'image/png', body: PNG });
    const res = await icon(CLAUDE);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.equals(PNG)).toBe(true);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'");
    expect(net.fetchFavicon).toHaveBeenCalledWith('claude.ai');
  });

  it('answers 404 when the host has no usable favicon', async () => {
    net.fetchFavicon.mockResolvedValue(null);
    const res = await icon(CLAUDE);
    expect(res.statusCode).toBe(404);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('fetches each host once - hits and misses are both cached', async () => {
    net.fetchFavicon.mockResolvedValueOnce({ contentType: 'image/png', body: PNG }).mockResolvedValueOnce(null);
    await icon(CLAUDE);
    await icon('https://claude.ai/another/client');
    await icon('https://chatgpt.com/oauth/client.json');
    await icon('https://chatgpt.com/oauth/client.json');
    expect(net.fetchFavicon.mock.calls).toEqual([['claude.ai'], ['chatgpt.com']]);
  });

  it.each([
    ['a host outside the allow-list', 'https://evil.example/client'],
    ['an internal address', 'https://127.0.0.1/client'],
    ['http', 'http://claude.ai/client'],
    ['a port', 'https://claude.ai:8443/client'],
    ['not a URL', 'claude'],
  ])('refuses %s without fetching anything', async (_label, clientId) => {
    const res = await icon(clientId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_client');
    expect(net.fetchFavicon).not.toHaveBeenCalled();
  });

  it('needs a client_id', async () => {
    expect((await icon()).statusCode).toBe(400);
  });

  it('is rate limited per IP - it is public and fetches from other hosts', async () => {
    net.fetchFavicon.mockResolvedValue(null);
    for (let i = 0; i < 60; i++) expect((await icon(CLAUDE)).statusCode).toBe(404);
    const res = await icon(CLAUDE);
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe('too_many_requests');
  });
});

describe('fetchFavicon', () => {
  async function realFetchFavicon() {
    const mod = await vi.importActual<typeof import('../src/modules/oauth/clientIcon.client.js')>(
      '../src/modules/oauth/clientIcon.client.js',
    );
    return mod.fetchFavicon;
  }

  function stubFetch(body: BodyInit | null, init: { status?: number; headers?: Record<string, string> } = {}) {
    const fetchMock = vi.fn(async () => new Response(body, { status: init.status ?? 200, headers: init.headers }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('returns a raster icon from /favicon.ico, without following redirects', async () => {
    const fetchMock = stubFetch(PNG, { headers: { 'content-type': 'image/png' } });
    const result = await (await realFetchFavicon())('claude.ai');
    expect(result?.contentType).toBe('image/png');
    expect(result?.body.equals(PNG)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://claude.ai/favicon.ico');
    expect(init.redirect).toBe('manual');
  });

  it.each([
    ['an SVG (scripts would run on our origin)', PNG, { 'content-type': 'image/svg+xml' }, 200],
    ['HTML (a bot-check page)', 'blocked', { 'content-type': 'text/html' }, 200],
    ['no content type', PNG, {}, 200],
    ['a redirect', null, { location: 'https://elsewhere.example/icon.png' }, 301],
    ['an error status', PNG, { 'content-type': 'image/png' }, 403],
    ['an empty body', '', { 'content-type': 'image/png' }, 200],
    ['an oversized icon', Buffer.alloc(100 * 1024 + 1), { 'content-type': 'image/png' }, 200],
  ])('rejects %s', async (_label, body, headers, status) => {
    stubFetch(body as BodyInit | null, { status, headers });
    expect(await (await realFetchFavicon())('claude.ai')).toBeNull();
  });

  it('rejects an oversized icon without a Content-Length, without buffering all of it', async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(16 * 1024));
      },
    });
    stubFetch(endless, { headers: { 'content-type': 'image/png' } });
    expect(await (await realFetchFavicon())('claude.ai')).toBeNull();
    expect(pulled).toBeLessThan(20);
  });

  it('returns null when the body breaks off mid-way', async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PNG);
        controller.error(new TypeError('terminated'));
      },
    });
    stubFetch(broken, { headers: { 'content-type': 'image/png' } });
    expect(await (await realFetchFavicon())('claude.ai')).toBeNull();
  });

  it('returns null when the host is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await (await realFetchFavicon())('claude.ai')).toBeNull();
  });
});
