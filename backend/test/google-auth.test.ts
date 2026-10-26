import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, pool } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { DEFAULT_EXERCISES } from '../src/db/defaultExercises.js';
import type { GoogleProfile } from '../src/modules/auth/google.client.js';
import { createTestApp, refreshCookie, registerUser, resetDb } from './helpers.js';

// No network: the module that talks to Google is replaced wholesale.
const google = vi.hoisted(() => ({
  isGoogleEnabled: vi.fn(),
  createGoogleAuthRequest: vi.fn(),
  exchangeCodeForProfile: vi.fn(),
}));
vi.mock('../src/modules/auth/google.client.js', () => google);

const STATE = 'a1b2c3d4';
const VERIFIER = 'verifier-with-~_-chars';
const GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?state=a1b2c3d4';

const profile = (overrides: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: 'google-sub-1',
  email: 'serhii@example.com',
  emailVerified: true,
  ...overrides,
});

let app: FastifyInstance;

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
  google.isGoogleEnabled.mockReturnValue(true);
  google.createGoogleAuthRequest.mockResolvedValue({ url: GOOGLE_URL, state: STATE, codeVerifier: VERIFIER });
  google.exchangeCodeForProfile.mockResolvedValue(profile());
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await pool.end();
});

// "mygym_google_flow=<value>" from the /google response, as a Cookie header.
function flowCookie(res: { headers: Record<string, unknown> }) {
  const raw = res.headers['set-cookie'];
  const all = Array.isArray(raw) ? raw : [raw];
  const found = all.find((c) => typeof c === 'string' && c.startsWith('mygym_google_flow='));
  if (!found) throw new Error('no mygym_google_flow cookie in response');
  return { header: found as string, pair: (found as string).split(';')[0] };
}

async function startFlow() {
  return flowCookie(await app.inject({ method: 'GET', url: '/api/auth/google' })).pair;
}

function callback(cookie: string | undefined, query = `code=the-code&state=${STATE}`) {
  return app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?${query}`,
    headers: cookie ? { cookie } : {},
  });
}

async function signInWithGoogle() {
  return callback(await startFlow());
}

describe('Google sign-in: configuration', () => {
  it('tells the SPA whether Google is configured', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/auth/providers' })).json()).toEqual({ google: true, demo: false });

    google.isGoogleEnabled.mockReturnValue(false);
    expect((await app.inject({ method: 'GET', url: '/api/auth/providers' })).json()).toEqual({ google: false, demo: false });
  });

  it('404s both Google routes when it is not configured', async () => {
    google.isGoogleEnabled.mockReturnValue(false);

    const start = await app.inject({ method: 'GET', url: '/api/auth/google' });
    expect(start.statusCode).toBe(404);
    expect(start.json().error).toBe('google_disabled');

    const cb = await callback(undefined);
    expect(cb.statusCode).toBe(404);
    expect(google.exchangeCodeForProfile).not.toHaveBeenCalled();
  });
});

describe('Google sign-in: start', () => {
  it('redirects to Google and keeps state + PKCE verifier in a short-lived httpOnly cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/google' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(GOOGLE_URL);
    const { header } = flowCookie(res);
    expect(header).toContain(`mygym_google_flow=${STATE}.${VERIFIER}`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Path=/api/auth/google');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Max-Age=600');
  });
});

describe('Google sign-in: callback', () => {
  it('creates a password-less account seeded like a registration and signs it in', async () => {
    const res = await signInWithGoogle();

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(google.exchangeCodeForProfile).toHaveBeenCalledWith('the-code', VERIFIER);

    const row = await db.query.users.findFirst({ where: eq(users.email, 'serhii@example.com') });
    expect(row).toMatchObject({ googleSub: 'google-sub-1', passwordHash: null });

    // The refresh cookie is the normal session: the SPA's refresh on load works.
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: refreshCookie(res) },
    });
    expect(refreshed.statusCode).toBe(200);
    const { accessToken } = refreshed.json();

    const exercises = await app.inject({
      method: 'GET',
      url: '/api/exercises',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(exercises.json()).toHaveLength(DEFAULT_EXERCISES.length);
  });

  it('links Google to an existing account with the same email (any case) and keeps its password', async () => {
    const existing = await registerUser(app, 'serhii@example.com');
    google.exchangeCodeForProfile.mockResolvedValue(profile({ email: 'Serhii@Example.com' }));

    const res = await signInWithGoogle();
    expect(res.headers.location).toBe('/');

    const all = await db.select().from(users);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: existing.user.id, googleSub: 'google-sub-1' });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'serhii@example.com', password: 'correct-horse-battery' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('finds a linked account by Google id even after the Google email changed', async () => {
    await signInWithGoogle();
    const [first] = await db.select().from(users);

    google.exchangeCodeForProfile.mockResolvedValue(profile({ email: 'renamed@example.com' }));
    const res = await signInWithGoogle();

    expect(res.headers.location).toBe('/');
    const all = await db.select().from(users);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(first.id);
  });

  it("prefers the account linked to the Google id over another account that has the profile's email", async () => {
    await signInWithGoogle(); // A: linked to google-sub-1 as serhii@example.com
    const [a] = await db.select().from(users);
    const b = await registerUser(app, 'renamed@example.com'); // B: someone else's password account

    // The owner of google-sub-1 changed their Google email to B's address.
    google.exchangeCodeForProfile.mockResolvedValue(profile({ email: 'renamed@example.com' }));
    const res = await signInWithGoogle();
    expect(res.headers.location).toBe('/');

    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: refreshCookie(res) },
    });
    const { sub } = JSON.parse(Buffer.from(refreshed.json().accessToken.split('.')[1], 'base64url').toString());
    expect(sub).toBe(a.id); // signed into A, not B

    const bRow = await db.query.users.findFirst({ where: eq(users.id, b.user.id) });
    expect(bRow!.googleSub).toBeNull(); // B untouched
  });

  it('signs out sessions that existed before Google was linked to the account', async () => {
    const existing = await registerUser(app, 'serhii@example.com');

    await signInWithGoogle();

    const old = await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { cookie: existing.cookie } });
    expect(old.statusCode).toBe(401);
  });

  it('turns an unexpected server error into a redirect, not a JSON error page', async () => {
    await registerUser(app, 'serhii@example.com');
    // Make linking fail inside the database.
    await db.execute(sql`ALTER TABLE users ADD CONSTRAINT google_test_block CHECK (google_sub IS NULL)`);
    try {
      const res = await signInWithGoogle();
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/login?error=google_failed');
    } finally {
      await db.execute(sql`ALTER TABLE users DROP CONSTRAINT google_test_block`);
    }
  });

  it('refuses an email Google has not verified, without creating or linking anything', async () => {
    await registerUser(app, 'serhii@example.com');
    google.exchangeCodeForProfile.mockResolvedValue(profile({ emailVerified: false }));

    const res = await signInWithGoogle();

    expect(res.headers.location).toBe('/login?error=google_email_unverified');
    const [row] = await db.select().from(users);
    expect(row.googleSub).toBeNull();
  });

  it("refuses an email whose account is linked to a different Google account", async () => {
    await signInWithGoogle();
    google.exchangeCodeForProfile.mockResolvedValue(profile({ sub: 'google-sub-2' }));

    const res = await signInWithGoogle();

    expect(res.headers.location).toBe('/login?error=google_account_mismatch');
    expect(String(res.headers['set-cookie'] ?? '')).not.toContain('mygym_refresh=');
  });

  it.each([
    ['no flow cookie', undefined, `code=the-code&state=${STATE}`],
    ['a state that does not match the cookie', `mygym_google_flow=${STATE}.${VERIFIER}`, 'code=the-code&state=forged'],
    ['no code', `mygym_google_flow=${STATE}.${VERIFIER}`, `state=${STATE}`],
    ['a malformed flow cookie', 'mygym_google_flow=garbage', `code=the-code&state=${STATE}`],
  ])('rejects a callback with %s', async (_label, cookie, query) => {
    const res = await callback(cookie, query);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/login?error=google_state_mismatch');
    expect(google.exchangeCodeForProfile).not.toHaveBeenCalled();
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('reports a cancelled Google consent', async () => {
    const res = await callback(await startFlow(), `error=access_denied&state=${STATE}`);
    expect(res.headers.location).toBe('/login?error=google_cancelled');
    expect(google.exchangeCodeForProfile).not.toHaveBeenCalled();
  });

  it('reports a failed code exchange instead of a 500', async () => {
    google.exchangeCodeForProfile.mockRejectedValue(new Error('invalid_grant'));
    const res = await signInWithGoogle();
    expect(res.headers.location).toBe('/login?error=google_failed');
  });

  it('clears the one-time flow cookie on the callback', async () => {
    const res = await signInWithGoogle();
    const cleared = flowCookie(res).header;
    expect(cleared).toMatch(/mygym_google_flow=;/);
    expect(cleared).toContain('Path=/api/auth/google');
  });
});

describe('Google sign-in: return-to after login', () => {
  it('lands on the requested path (e.g. the OAuth consent page)', async () => {
    const start = await app.inject({ method: 'GET', url: '/api/auth/google?next=%2Foauth%2Fconsent%3Frequest%3Dabc' });
    const cookies = ([] as string[]).concat(start.headers['set-cookie'] as string[]).map((c) => c.split(';')[0]);
    const res = await callback(cookies.join('; '));
    expect(res.headers.location).toBe('/oauth/consent?request=abc');
  });

  it.each([
    '//evil.example/x',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/%09/evil.example/../x\\',
    'https://evil.example/',
    'javascript:alert(1)',
  ])(
    'ignores an off-site next (%s)',
    async (next) => {
      const start = await app.inject({ method: 'GET', url: `/api/auth/google?next=${encodeURIComponent(next)}` });
      const cookies = ([] as string[]).concat(start.headers['set-cookie'] as string[]).map((c) => c.split(';')[0]);
      const res = await callback(cookies.join('; '));
      expect(res.headers.location).toBe('/');
    },
  );
});

describe('password login into a Google-only account', () => {
  it('says to use Google instead of "wrong password"', async () => {
    await signInWithGoogle();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'serhii@example.com', password: 'whatever-password' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('use_google_login');
  });
});
