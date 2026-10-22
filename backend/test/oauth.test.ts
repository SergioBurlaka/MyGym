import crypto from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, pool } from '../src/db/client.js';
import { apiTokens, oauthAuthorizationRequests, oauthGrants } from '../src/db/schema.js';
import { MCP_RESOURCE, ISSUER } from '../src/modules/oauth/oauth.config.js';
import { createTestApp, registerUser, resetDb } from './helpers.js';

// Only the network fetch of the client's metadata document is replaced;
// redirect URI matching etc. stay real.
const cimd = vi.hoisted(() => ({ resolveClient: vi.fn() }));
vi.mock('../src/modules/oauth/cimd.client.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveClient: cimd.resolveClient,
}));

const CLIENT = {
  clientId: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
  clientName: 'Claude',
  logoUri: 'https://claude.ai/logo.png',
  redirectUris: ['https://claude.ai/api/mcp/auth_callback', 'http://localhost/callback'],
};
const REDIRECT = CLIENT.redirectUris[0];

const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

let app: FastifyInstance;
// The test's one browser: /authorize sets this cookie, the consent API needs it.
let browserCookie: string | undefined;

beforeEach(async () => {
  await resetDb();
  browserCookie = undefined;
  vi.resetAllMocks();
  cimd.resolveClient.mockImplementation(async (clientId: string) => {
    if (clientId === CLIENT.clientId) return CLIENT;
    const { OAuthClientError } = await vi.importActual<typeof import('../src/modules/oauth/cimd.client.js')>(
      '../src/modules/oauth/cimd.client.js',
    );
    throw new OAuthClientError('unknown client');
  });
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await pool.end();
});

type User = Awaited<ReturnType<typeof registerUser>>;

function authorizeUrl(overrides: Record<string, string | undefined> = {}) {
  const params = {
    response_type: 'code',
    client_id: CLIENT.clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'state-123',
    scope: 'mygym',
    resource: MCP_RESOURCE,
    ...overrides,
  };
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]);
  return `/api/oauth/authorize?${qs}`;
}

async function authorize(overrides: Record<string, string | undefined> = {}) {
  const res = await app.inject({ method: 'GET', url: authorizeUrl(overrides), headers: browserCookie ? { cookie: browserCookie } : {} });
  const set = ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []);
  const found = set.find((c) => c.startsWith('mygym_oauth_browser='));
  if (found) browserCookie = found.split(';')[0];
  return res;
}

// The logged-in user in the browser that started the request.
const inBrowser = (user: User, cookie = browserCookie) => ({ ...user.auth, ...(cookie ? { cookie } : {}) });

async function startRequest() {
  const res = await authorize();
  expect(res.statusCode).toBe(302);
  const location = new URL(res.headers.location as string, 'http://x');
  expect(location.pathname).toBe('/oauth/consent');
  return location.searchParams.get('request')!;
}

async function approve(user: User, requestId: string, approved = true) {
  return app.inject({
    method: 'POST',
    url: `/api/oauth/requests/${requestId}/decision`,
    headers: inBrowser(user),
    payload: { approve: approved },
  });
}

async function getCode(user: User) {
  const requestId = await startRequest();
  const res = await approve(user, requestId);
  expect(res.statusCode).toBe(200);
  return new URL(res.json().redirectTo).searchParams.get('code')!;
}

function token(form: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/api/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(form).toString(),
  });
}

function exchange(code: string, overrides: Record<string, string> = {}) {
  return token({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
    client_id: CLIENT.clientId,
    resource: MCP_RESOURCE,
    ...overrides,
  });
}

async function signIn(user: User) {
  const res = await exchange(await getCode(user));
  expect(res.statusCode).toBe(200);
  return res.json() as { access_token: string; refresh_token: string; expires_in: number; token_type: string; scope: string };
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe('discovery documents', () => {
  it('serve authorization server metadata: CIMD + PKCE for Claude and ChatGPT, DCR for the rest', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/api/oauth/authorize`,
      token_endpoint: `${ISSUER}/api/oauth/token`,
      registration_endpoint: `${ISSUER}/api/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  it.each(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'])(
    'serve protected resource metadata at %s',
    async (url) => {
      const res = await app.inject({ method: 'GET', url });
      expect(res.json()).toEqual(
        expect.objectContaining({ resource: MCP_RESOURCE, authorization_servers: [ISSUER], scopes_supported: ['mygym'] }),
      );
    },
  );
});

describe('authorize', () => {
  it('stores the request and sends the browser to the consent page', async () => {
    const requestId = await startRequest();
    const row = await db.query.oauthAuthorizationRequests.findFirst({ where: eq(oauthAuthorizationRequests.id, requestId) });
    expect(row).toMatchObject({ clientName: 'Claude', redirectUri: REDIRECT, codeChallenge: challenge, resource: MCP_RESOURCE });
  });

  it('accepts a loopback redirect on any port (Claude Code)', async () => {
    const res = await authorize({ redirect_uri: 'http://localhost:53682/callback' });
    expect(res.headers.location).toMatch(/^\/oauth\/consent\?request=/);
  });

  it.each([
    ['an unknown client', { client_id: 'https://evil.example/client' }, 'invalid_client'],
    ['an unregistered redirect URI', { redirect_uri: 'https://evil.example/callback' }, 'invalid_request'],
    ['no client_id', { client_id: undefined }, 'invalid_request'],
  ])('never redirects to the client for %s', async (_label, overrides, code) => {
    const res = await authorize(overrides);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/oauth/consent?error=${code}`);
    expect(await db.select().from(oauthAuthorizationRequests)).toHaveLength(0);
  });

  it('refuses a repeated parameter without redirecting anywhere', async () => {
    const res = await app.inject({ method: 'GET', url: `${authorizeUrl()}&redirect_uri=${encodeURIComponent('https://evil.example/cb')}` });
    expect(res.headers.location).toBe('/oauth/consent?error=invalid_request');
    expect(await db.select().from(oauthAuthorizationRequests)).toHaveLength(0);
  });

  it.each([
    ['no PKCE', { code_challenge: undefined }, 'invalid_request'],
    ['plain PKCE', { code_challenge_method: 'plain' }, 'invalid_request'],
    ['a malformed challenge', { code_challenge: 'short' }, 'invalid_request'],
    ['another resource', { resource: 'https://evil.example/mcp' }, 'invalid_target'],
    ['an unknown scope', { scope: 'mygym admin' }, 'invalid_scope'],
    ['response_type=token', { response_type: 'token' }, 'unsupported_response_type'],
  ])('reports %s back to the (trusted) client with state and iss', async (_label, overrides, code) => {
    const res = await authorize(overrides);
    const location = new URL(res.headers.location as string);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get('error')).toBe(code);
    expect(location.searchParams.get('state')).toBe('state-123');
    expect(location.searchParams.get('iss')).toBe(ISSUER);
  });
});

describe('consent', () => {
  it('shows the client name and the redirect host to the logged-in user', async () => {
    const user = await registerUser(app);
    const requestId = await startRequest();
    const res = await app.inject({ method: 'GET', url: `/api/oauth/requests/${requestId}`, headers: inBrowser(user) });
    expect(res.json()).toMatchObject({ clientName: 'Claude', verified: true, clientHost: 'claude.ai', redirectHost: 'claude.ai' });
  });

  it("can't be seen or answered from another browser (a consent link sent to a victim)", async () => {
    const victim = await registerUser(app);
    const requestId = await startRequest(); // the attacker's browser

    for (const cookie of [undefined, `mygym_oauth_browser=${crypto.randomBytes(32).toString('base64url')}`]) {
      const headers = { ...victim.auth, ...(cookie ? { cookie } : {}) };
      expect((await app.inject({ method: 'GET', url: `/api/oauth/requests/${requestId}`, headers })).statusCode).toBe(404);
      const res = await app.inject({
        method: 'POST',
        url: `/api/oauth/requests/${requestId}/decision`,
        headers,
        payload: { approve: true },
      });
      expect(res.statusCode).toBe(404);
    }
    const [row] = await db.select().from(oauthAuthorizationRequests);
    expect(row.userId).toBeNull();
  });

  it('binds requests with a short-lived httpOnly cookie, shared by parallel requests of one browser', async () => {
    const res = await authorize();
    const header = ([] as string[]).concat(res.headers['set-cookie'] as string[]).find((c) => c.startsWith('mygym_oauth_browser='))!;
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Path=/api/oauth');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Max-Age=600');

    const user = await registerUser(app);
    const first = await startRequest();
    const second = await startRequest(); // e.g. connecting ChatGPT at the same time
    expect((await approve(user, first)).statusCode).toBe(200);
    expect((await approve(user, second)).statusCode).toBe(200);
  });

  it('needs a browser session, not a token (no approving more access with a leaked token)', async () => {
    const user = await registerUser(app);
    const pat = (await app.inject({ method: 'POST', url: '/api/tokens', headers: user.auth, payload: { name: 'x' } })).json().token;
    const requestId = await startRequest();

    expect((await app.inject({ method: 'GET', url: `/api/oauth/requests/${requestId}` })).statusCode).toBe(401);
    const res = await app.inject({
      method: 'POST',
      url: `/api/oauth/requests/${requestId}/decision`,
      headers: bearer(pat),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('session_required');
  });

  it('on deny sends access_denied back, and the request is spent', async () => {
    const user = await registerUser(app);
    const requestId = await startRequest();
    const res = await approve(user, requestId, false);
    const location = new URL(res.json().redirectTo);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('iss')).toBe(ISSUER);
    expect((await approve(user, requestId)).statusCode).toBe(404);
  });

  it('on approve sends a code with state and iss - only once', async () => {
    const user = await registerUser(app);
    const requestId = await startRequest();
    const location = new URL((await approve(user, requestId)).json().redirectTo);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get('state')).toBe('state-123');
    expect(location.searchParams.get('iss')).toBe(ISSUER);
    expect((await approve(user, requestId)).statusCode).toBe(404);
  });

  it('expires', async () => {
    const user = await registerUser(app);
    const requestId = await startRequest();
    await db.update(oauthAuthorizationRequests).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await approve(user, requestId)).statusCode).toBe(404);
  });
});

describe('token: authorization code', () => {
  it('issues an access token that works on the API and a refresh token, never cached', async () => {
    const user = await registerUser(app);
    const res = await exchange(await getCode(user));
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json();
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'mygym' });
    expect(body.access_token).toMatch(/^mygym_oat_/);
    expect(body.refresh_token).toMatch(/^mygym_ort_/);

    const workouts = await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(body.access_token) });
    expect(workouts.statusCode).toBe(200);
  });

  it('is single-use', async () => {
    const user = await registerUser(app);
    const code = await getCode(user);
    expect((await exchange(code)).statusCode).toBe(200);
    const again = await exchange(code);
    expect(again.statusCode).toBe(400);
    expect(again.json().error).toBe('invalid_grant');
  });

  it.each([
    ['a wrong code_verifier', { code_verifier: crypto.randomBytes(32).toString('base64url') }],
    ['another client_id', { client_id: 'https://claude.ai/oauth/other' }],
    ['another redirect_uri', { redirect_uri: 'http://localhost/callback' }],
  ])('rejects %s', async (_label, overrides) => {
    const user = await registerUser(app);
    const res = await exchange(await getCode(user), overrides);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_grant');
  });

  it('rejects an expired code', async () => {
    const user = await registerUser(app);
    const code = await getCode(user);
    await db.update(oauthAuthorizationRequests).set({ codeExpiresAt: new Date(Date.now() - 1000) });
    expect((await exchange(code)).json().error).toBe('invalid_grant');
  });

  it('rejects another resource', async () => {
    const user = await registerUser(app);
    const res = await exchange(await getCode(user), { resource: 'https://evil.example/mcp' });
    expect(res.json().error).toBe('invalid_target');
  });

  it('rejects an unsupported grant type', async () => {
    expect((await token({ grant_type: 'password' })).json().error).toBe('unsupported_grant_type');
  });

  it('answers a repeated parameter with invalid_request, not a 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=refresh_token&refresh_token=a&refresh_token=b&client_id=x',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_request');
  });
});

describe('access tokens', () => {
  it('stop working when expired', async () => {
    const user = await registerUser(app);
    const { access_token } = await signIn(user);
    await db.update(apiTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(access_token) })).statusCode).toBe(401);
  });

  it("only ever see their own user's data", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    await app.inject({ method: 'POST', url: '/api/workouts', headers: alice.auth, payload: {} });
    const { access_token } = await signIn(bob);
    const list = await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(access_token) });
    expect(list.json().total).toBe(0);
  });

  it("can't manage tokens or approve more access", async () => {
    const user = await registerUser(app);
    const { access_token } = await signIn(user);
    const res = await app.inject({ method: 'POST', url: '/api/tokens', headers: bearer(access_token), payload: { name: 'x' } });
    expect(res.statusCode).toBe(403);
  });

  it("don't show up as personal access tokens", async () => {
    const user = await registerUser(app);
    await signIn(user);
    expect((await app.inject({ method: 'GET', url: '/api/tokens', headers: user.auth })).json()).toEqual([]);
  });
});

describe('token: refresh', () => {
  it('rotates: a new pair each time, the new access token works', async () => {
    const user = await registerUser(app);
    const first = await signIn(user);
    const res = await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: CLIENT.clientId });
    expect(res.statusCode).toBe(200);
    const second = res.json();
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect((await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(second.access_token) })).statusCode).toBe(200);
  });

  it('treats a replayed refresh token as theft and revokes the whole connection', async () => {
    const user = await registerUser(app);
    const first = await signIn(user);
    const second = (
      await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: CLIENT.clientId })
    ).json();

    const replay = await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: CLIENT.clientId });
    expect(replay.json().error).toBe('invalid_grant');

    const [grant] = await db.select().from(oauthGrants);
    expect(grant.revokedAt).toBeInstanceOf(Date);
    expect((await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(second.access_token) })).statusCode).toBe(401);
    const next = await token({ grant_type: 'refresh_token', refresh_token: second.refresh_token, client_id: CLIENT.clientId });
    expect(next.json().error).toBe('invalid_grant');
  });

  it('rejects another client_id and unknown tokens', async () => {
    const user = await registerUser(app);
    const { refresh_token } = await signIn(user);
    const other = await token({ grant_type: 'refresh_token', refresh_token, client_id: 'https://chatgpt.com/oauth/client.json' });
    expect(other.json().error).toBe('invalid_grant');
    const unknown = await token({ grant_type: 'refresh_token', refresh_token: 'mygym_ort_nope', client_id: CLIENT.clientId });
    expect(unknown.json().error).toBe('invalid_grant');
  });
});

describe('connected apps', () => {
  it('lists the connection and revoking it cuts access and refresh at once', async () => {
    const user = await registerUser(app);
    const { access_token, refresh_token } = await signIn(user);

    const list = await app.inject({ method: 'GET', url: '/api/oauth/grants', headers: user.auth });
    expect(list.json()).toEqual([
      expect.objectContaining({ clientName: 'Claude', clientId: CLIENT.clientId, logoUri: CLIENT.logoUri }),
    ]);

    const del = await app.inject({ method: 'DELETE', url: `/api/oauth/grants/${list.json()[0].id}`, headers: user.auth });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(access_token) })).statusCode).toBe(401);
    expect(
      (await token({ grant_type: 'refresh_token', refresh_token, client_id: CLIENT.clientId })).json().error,
    ).toBe('invalid_grant');
    expect((await app.inject({ method: 'GET', url: '/api/oauth/grants', headers: user.auth })).json()).toEqual([]);
  });

  it("can't see or revoke another user's connection", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const { access_token } = await signIn(alice);
    const [grant] = await db.select().from(oauthGrants);

    expect((await app.inject({ method: 'GET', url: '/api/oauth/grants', headers: bob.auth })).json()).toEqual([]);
    const del = await app.inject({ method: 'DELETE', url: `/api/oauth/grants/${grant.id}`, headers: bob.auth });
    expect(del.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/workouts', headers: bearer(access_token) })).statusCode).toBe(200);
  });
});
