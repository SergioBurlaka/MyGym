import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';

export async function resetDb() {
  // Every other table hangs off users via ON DELETE CASCADE foreign keys.
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
}

export async function createTestApp(): Promise<FastifyInstance> {
  const app = buildApp({ logger: false });
  await app.ready();
  return app;
}

// Pulls "mygym_refresh=<value>" out of a Set-Cookie header, ready to send
// back as a Cookie header.
export function refreshCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const all = Array.isArray(raw) ? raw : [raw];
  const found = all.find((c) => typeof c === 'string' && c.startsWith('mygym_refresh='));
  if (!found) throw new Error('no mygym_refresh cookie in response');
  return (found as string).split(';')[0];
}

let counter = 0;

export async function registerUser(app: FastifyInstance, email = `user${++counter}@example.com`) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'correct-horse-battery' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  const body = res.json() as { accessToken: string; user: { id: string; email: string } };
  return { ...body, cookie: refreshCookie(res), auth: { authorization: `Bearer ${body.accessToken}` } };
}
