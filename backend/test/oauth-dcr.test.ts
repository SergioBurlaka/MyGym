import crypto from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, pool } from '../src/db/client.js';
import { oauthClients, oauthGrants } from '../src/db/schema.js';
import { MCP_RESOURCE } from '../src/modules/oauth/oauth.config.js';
import { createTestApp, registerUser, resetDb } from './helpers.js';

// Dynamic Client Registration (RFC 7591) for clients without CIMD (Gemini).
// The CIMD path (Claude, ChatGPT) is covered in oauth.test.ts.

const REDIRECT = 'https://gemini.google.com/oauth/callback';
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

let app: FastifyInstance;
let browserCookie: string | undefined;

beforeEach(async () => {
  await resetDb();
  await db.delete(oauthClients); // not a child of users, so TRUNCATE users doesn't reach it
  browserCookie = undefined;
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await pool.end();
});

type User = Awaited<ReturnType<typeof registerUser>>;
type Registered = { client_id: string; client_secret?: string; [k: string]: unknown };

function register(payload: unknown) {
  return app.inject({ method: 'POST', url: '/api/oauth/register', payload: payload as object });
}

async function registerOk(overrides: Record<string, unknown> = {}): Promise<Registered> {
  const res = await register({
    client_name: 'Gemini',
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['authorization_code', 'refresh_token'],
    ...overrides,
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

async function authorize(clientId: string, redirectUri = REDIRECT) {
  const qs = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 's',
    resource: MCP_RESOURCE,
  });
  const res = await app.inject({ method: 'GET', url: `/api/oauth/authorize?${qs}`, headers: browserCookie ? { cookie: browserCookie } : {} });
  const set = ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []);
  const found = set.find((c) => c.startsWith('mygym_oauth_browser='));
  if (found) browserCookie = found.split(';')[0];
  return res;
}

const inBrowser = (user: User) => ({ ...user.auth, ...(browserCookie ? { cookie: browserCookie } : {}) });

async function requestId(clientId: string) {
  const res = await authorize(clientId);
  expect(res.statusCode).toBe(302);
  return new URL(res.headers.location as string, 'http://x').searchParams.get('request')!;
}

async function getCode(user: User, clientId: string) {
  const id = await requestId(clientId);
  const res = await app.inject({ method: 'POST', url: `/api/oauth/requests/${id}/decision`, headers: inBrowser(user), payload: { approve: true } });
  expect(res.statusCode).toBe(200);
  return new URL(res.json().redirectTo).searchParams.get('code')!;
}

function token(form: Record<string, string>, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    payload: new URLSearchParams(form).toString(),
  });
}

const codeForm = (code: string, clientId: string, extra: Record<string, string> = {}) => ({
  grant_type: 'authorization_code',
  code,
  redirect_uri: REDIRECT,
  code_verifier: verifier,
  client_id: clientId,
  ...extra,
});

const basic = (id: string, secret: string) => ({
  authorization: `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64')}`,
});

describe('registration', () => {
  it('registers a confidential client, the secret shown once and stored only hashed', async () => {
    const client = await registerOk();
    expect(client).toMatchObject({
      client_name: 'Gemini',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'client_secret_post',
      client_secret_expires_at: 0,
    });
    expect(client.client_id).toMatch(/^mygym_cli_[0-9a-f]{32}$/);
    expect(client.client_secret).toMatch(/^mygym_cls_[0-9a-f]{64}$/);
    const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, client.client_id));
    expect(row.clientSecretHash).not.toContain(client.client_secret);
    expect(row.clientSecretHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('registers a public client without a secret', async () => {
    const client = await registerOk({ token_endpoint_auth_method: 'none' });
    expect(client.client_secret).toBeUndefined();
  });

  it('defaults to client_secret_basic and names a nameless client after its redirect host (RFC 7591)', async () => {
    const res = await register({ redirect_uris: [REDIRECT] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ token_endpoint_auth_method: 'client_secret_basic', client_name: 'gemini.google.com' });
    expect(res.json().client_secret).toBeDefined();
  });

  it.each([
    ['http on a public host', ['http://evil.example/cb']],
    ['a custom scheme', ['cursor://anysphere/cb']],
    ['javascript:', ['javascript:alert(1)']],
    ['a fragment', ['https://gemini.google.com/cb#x']],
    ['a wildcard', ['https://*.googleusercontent.com/cb']],
    ['no redirect at all', []],
  ])('refuses %s as a redirect URI', async (_label, redirectUris) => {
    const res = await register({ redirect_uris: redirectUris, token_endpoint_auth_method: 'none' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_redirect_uri');
  });

  it('accepts a loopback redirect (desktop and CLI clients)', async () => {
    const client = await registerOk({ redirect_uris: ['http://127.0.0.1:7777/callback'], token_endpoint_auth_method: 'none' });
    expect(client.redirect_uris).toEqual(['http://127.0.0.1:7777/callback']);
  });

  it.each([
    ['an unknown auth method', { token_endpoint_auth_method: 'private_key_jwt' }],
    ['an implicit grant', { grant_types: ['implicit'] }],
    ['no authorization_code grant', { grant_types: ['refresh_token'] }],
    ['a token response type', { response_types: ['token'] }],
    ['a non-object body', null],
  ])('refuses %s', async (_label, extra) => {
    const res = await register(extra === null ? [] : { redirect_uris: [REDIRECT], ...extra });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_client_metadata');
  });

  it.each([
    ['a non-https', 'javascript:alert(1)'],
    ['a non-string', { href: 'https://x.example' }],
  ])('drops %s client_uri instead of storing it', async (_label, clientUri) => {
    const client = await registerOk({ client_uri: clientUri });
    expect(client.client_uri).toBeUndefined();
  });

  it("ignores grant types it doesn't do instead of refusing the client", async () => {
    const client = await registerOk({ grant_types: ['authorization_code', 'refresh_token', 'client_credentials'] });
    expect(client.grant_types).toEqual(['authorization_code', 'refresh_token']);
  });

  it('is rate limited per IP', async () => {
    for (let i = 0; i < 10; i++) expect((await register({ redirect_uris: [REDIRECT] })).statusCode).toBe(201);
    const res = await register({ redirect_uris: [REDIRECT] });
    expect(res.statusCode).toBe(429);
  });

  it('expires old clients nobody connected, keeps connected, connecting and recent ones', async () => {
    const user = await registerUser(app);
    const unused = await registerOk();
    const connected = await registerOk();
    const connecting = await registerOk();
    const fresh = await registerOk();
    await db.insert(oauthGrants).values({ userId: user.user.id, clientId: connected.client_id, clientName: 'Gemini', resource: MCP_RESOURCE, scope: 'mygym' });
    await requestId(connecting.client_id); // on the consent screen right now
    const old = new Date(Date.now() - 31 * 24 * 60 * 60_000);
    for (const c of [unused, connected, connecting]) await db.update(oauthClients).set({ createdAt: old }).where(eq(oauthClients.id, c.client_id));

    await registerOk(); // registration does the housekeeping
    const ids = (await db.select({ id: oauthClients.id }).from(oauthClients)).map((r) => r.id);
    expect(ids).not.toContain(unused.client_id);
    expect(ids).toEqual(expect.arrayContaining([connected.client_id, connecting.client_id, fresh.client_id]));
  });
});

describe('signing in with a registered client', () => {
  it('marks it unverified on the consent screen, with no client host', async () => {
    const user = await registerUser(app);
    const client = await registerOk();
    const id = await requestId(client.client_id);
    const res = await app.inject({ method: 'GET', url: `/api/oauth/requests/${id}`, headers: inBrowser(user) });
    expect(res.json()).toMatchObject({ clientName: 'Gemini', verified: false, clientHost: null, redirectHost: 'gemini.google.com' });
  });

  it('refuses an unknown client_id and an unregistered redirect without redirecting there', async () => {
    const client = await registerOk();
    for (const res of [
      await authorize('mygym_cli_00000000000000000000000000000000'),
      await authorize('just-some-id'),
      await authorize(client.client_id, 'https://evil.example/cb'),
    ]) {
      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string, 'http://x');
      expect(location.pathname).toBe('/oauth/consent');
      expect(location.searchParams.get('error')).toBeTruthy();
    }
  });

  it('never redirects its request errors to the registered redirect: anyone can register any https URL', async () => {
    const client = await registerOk({ redirect_uris: ['https://evil.example/cb'] });
    for (const bad of [{ response_type: 'token' }, { code_challenge_method: 'plain' }, { scope: 'admin' }, { resource: 'https://x.example/mcp' }]) {
      const qs = new URLSearchParams({
        response_type: 'code',
        client_id: client.client_id,
        redirect_uri: 'https://evil.example/cb',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        resource: MCP_RESOURCE,
        ...bad,
      });
      const res = await app.inject({ method: 'GET', url: `/api/oauth/authorize?${qs}` });
      expect(res.statusCode).toBe(302);
      const location = res.headers.location as string;
      expect(location).toMatch(/^\/oauth\/consent\?error=/);
      expect(location).not.toContain('evil.example');
    }
  });

  it('confidential, client_secret_post: tokens that work on the API, refresh with the secret', async () => {
    const user = await registerUser(app);
    const client = await registerOk();
    const res = await token(codeForm(await getCode(user, client.client_id), client.client_id, { client_secret: client.client_secret! }));
    expect(res.statusCode).toBe(200);
    const { access_token, refresh_token } = res.json();
    expect((await app.inject({ method: 'GET', url: '/api/workouts', headers: { authorization: `Bearer ${access_token}` } })).statusCode).toBe(200);

    const noSecret = await token({ grant_type: 'refresh_token', refresh_token, client_id: client.client_id });
    expect(noSecret.statusCode).toBe(401);
    expect(noSecret.json().error).toBe('invalid_client');
    const refreshed = await token({ grant_type: 'refresh_token', refresh_token, client_id: client.client_id, client_secret: client.client_secret! });
    expect(refreshed.statusCode).toBe(200);
  });

  it('confidential, client_secret_basic', async () => {
    const user = await registerUser(app);
    const client = await registerOk({ token_endpoint_auth_method: 'client_secret_basic' });
    const form = codeForm(await getCode(user, client.client_id), client.client_id);
    const { client_id: _omit, ...withoutId } = form;
    const res = await token(withoutId, basic(client.client_id, client.client_secret!));
    expect(res.statusCode).toBe(200);

    const refresh = { grant_type: 'refresh_token', refresh_token: res.json().refresh_token };
    const wrong = await token(refresh, basic(client.client_id, 'mygym_cls_wrong'));
    expect(wrong.statusCode).toBe(401);
    expect(wrong.headers['www-authenticate']).toBe('Basic realm="mygym"');
    expect((await token(refresh, basic(client.client_id, client.client_secret!))).statusCode).toBe(200);
  });

  it.each([
    ['no secret', {}, {}],
    ['a wrong secret', { client_secret: 'mygym_cls_wrong' }, {}],
    ['a wrong Basic secret', {}, 'basic-wrong'],
    ['malformed Basic', {}, { authorization: 'Basic !!!' }],
  ])('rejects the code exchange with %s, and leaves the code usable', async (_label, extra, headers) => {
    const user = await registerUser(app);
    const client = await registerOk();
    const code = await getCode(user, client.client_id);
    const h = headers === 'basic-wrong' ? basic(client.client_id, 'mygym_cls_wrong') : (headers as Record<string, string>);
    const form = headers === 'basic-wrong' ? (({ client_id: _x, ...f }) => f)(codeForm(code, client.client_id)) : codeForm(code, client.client_id, extra as Record<string, string>);
    const res = await token(form, h);
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('invalid_client');
    // The legitimate client can still finish.
    expect((await token(codeForm(code, client.client_id, { client_secret: client.client_secret! }))).statusCode).toBe(200);
  });

  it("refuses both Basic and a body secret, or a Basic id that isn't the body's", async () => {
    const user = await registerUser(app);
    const client = await registerOk();
    const code = await getCode(user, client.client_id);
    const both = await token(codeForm(code, client.client_id, { client_secret: client.client_secret! }), basic(client.client_id, client.client_secret!));
    expect(both.json().error).toBe('invalid_request');
    const mismatch = await token(codeForm(code, 'mygym_cli_other'), basic(client.client_id, client.client_secret!));
    expect(mismatch.json().error).toBe('invalid_request');
  });

  it('still needs PKCE from a confidential client', async () => {
    const user = await registerUser(app);
    const client = await registerOk();
    const res = await token(
      codeForm(await getCode(user, client.client_id), client.client_id, { client_secret: client.client_secret!, code_verifier: 'x'.repeat(43) }),
    );
    expect(res.json().error).toBe('invalid_grant');
  });

  it("a code for one client can't be redeemed by another registered client", async () => {
    const user = await registerUser(app);
    const gemini = await registerOk();
    const other = await registerOk({ client_name: 'Other' });
    const res = await token(codeForm(await getCode(user, gemini.client_id), other.client_id, { client_secret: other.client_secret! }));
    expect(res.json().error).toBe('invalid_grant');
  });

  it('public client: PKCE only, no secret needed', async () => {
    const user = await registerUser(app);
    const client = await registerOk({ token_endpoint_auth_method: 'none' });
    const res = await token(codeForm(await getCode(user, client.client_id), client.client_id));
    expect(res.statusCode).toBe(200);
  });

  it('lists the connection with a letter-only icon: no logo from a self-registered client', async () => {
    const user = await registerUser(app);
    const client = await registerOk({ logo_uri: 'https://evil.example/logo.png' });
    await token(codeForm(await getCode(user, client.client_id), client.client_id, { client_secret: client.client_secret! }));
    const list = await app.inject({ method: 'GET', url: '/api/oauth/grants', headers: user.auth });
    expect(list.json()).toEqual([expect.objectContaining({ clientName: 'Gemini', clientId: client.client_id, logoUri: null })]);
  });

  it("only ever sees its own user's data", async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const client = await registerOk();
    const res = await token(codeForm(await getCode(alice, client.client_id), client.client_id, { client_secret: client.client_secret! }));
    const ids = async (headers: Record<string, string>) =>
      ((await app.inject({ method: 'GET', url: '/api/exercises', headers })).json() as { id: string }[]).map((e) => e.id);
    const viaClient = await ids({ authorization: `Bearer ${res.json().access_token}` });
    expect(viaClient).toEqual(await ids(alice.auth));
    const bobIds = await ids(bob.auth);
    expect(viaClient.some((id) => bobIds.includes(id))).toBe(false);
  });
});
