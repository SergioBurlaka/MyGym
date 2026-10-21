import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp, MCP_RATE_LIMIT } from '../src/app.js';

// A stand-in for the MyGym API: every token sees only "its" data, so a mixup
// between callers would show up as the wrong data, not just a wrong header.
const TOKENS = {
  alice: 'Bearer mygym_pat_alice',
  bob: 'Bearer mygym_pat_bob',
  revoked: 'Bearer mygym_pat_revoked',
  // Accepted by the up-front check, then revoked before the tool call.
  revokedMidway: 'Bearer mygym_pat_revoked_midway',
  // The token check itself answers 500.
  checkFails: 'Bearer mygym_pat_check_fails',
};
const PUBLIC_URL = 'https://gym.example';
const RESOURCE_METADATA = `${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp`;

type Seen = { method: string; url: string; authorization?: string; body: unknown };
let seen: Seen[] = [];
let checks: (string | undefined)[] = [];
let backend: FastifyInstance;
let backendUrl: string;

beforeAll(async () => {
  backend = Fastify();
  backend.addHook('onRequest', async (request, reply) => {
    const auth = request.headers.authorization;
    const rejected = auth === TOKENS.revoked || (auth === TOKENS.revokedMidway && request.url !== '/api/settings');
    if (rejected) return reply.code(401).send({ error: 'invalid_token' });
  });
  // The MCP server's token check - kept out of `seen`, which is about tools.
  backend.get('/api/settings', async (request, reply) => {
    checks.push(request.headers.authorization);
    if (request.headers.authorization === TOKENS.checkFails) return reply.code(500).send({ error: 'internal_error' });
    return { trainingDays: [1, 3, 5] };
  });
  backend.addHook('preHandler', async (request) => {
    if (request.url === '/api/settings') return;
    seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body: request.body });
  });
  const owner = (auth?: string) => (auth === TOKENS.alice ? 'alice' : 'bob');
  backend.get('/api/exercises', async (request) => [{ id: 'ex-1', name: `${owner(request.headers.authorization)}'s squat` }]);
  backend.get('/api/workouts', async (request) => {
    // Slow enough that two parallel callers overlap inside the MCP server.
    await new Promise((r) => setTimeout(r, 50));
    return { data: [{ id: `${owner(request.headers.authorization)}-workout` }], total: 1 };
  });
  backend.put('/api/workouts/:id/exercises', async (request) => ({ id: (request.params as { id: string }).id, saved: request.body }));
  backend.post('/api/exercises', async (_request, reply) =>
    reply.code(400).send({ error: 'validation_error', issues: [{ path: ['repRangeMax'], message: 'rep_range_invalid' }] }),
  );
  backend.get('/api/progression', async (_request, reply) => reply.code(500).send({ error: 'internal_error' }));
  backendUrl = await backend.listen({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  await backend.close();
});

let mcp: FastifyInstance;
let mcpUrl: URL;
const clients: Client[] = [];

beforeEach(async () => {
  seen = [];
  checks = [];
  mcp = buildApp({ apiUrl: `${backendUrl}/api`, publicUrl: PUBLIC_URL, logger: false });
  mcpUrl = new URL(`${await mcp.listen({ port: 0, host: '127.0.0.1' })}/mcp`);
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await mcp.close();
});

async function connect(authorization: string) {
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(mcpUrl, { requestInit: { headers: { authorization } } }));
  clients.push(client);
  return client;
}

function rawPost(authorization?: string, url: URL | string = mcpUrl) {
  return fetch(url, {
    method: 'POST',
    headers: {
      ...(authorization ? { authorization } : {}),
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

function text(result: Awaited<ReturnType<Client['callTool']>>) {
  return (result.content as { type: string; text: string }[])[0].text;
}

describe('MCP protocol', () => {
  it('lists every tool', async () => {
    const client = await connect(TOKENS.alice);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'create_exercise',
        'create_program',
        'finish_workout',
        'get_exercise_history',
        'get_progression_overview',
        'get_suggested_program',
        'get_workout',
        'list_exercises',
        'list_programs',
        'list_recent_workouts',
        'log_workout_exercises',
        'start_workout',
      ],
    );
  });

  it('warns in the tool description that log_workout_exercises replaces the whole list', async () => {
    const client = await connect(TOKENS.alice);
    const { tools } = await client.listTools();
    const log = tools.find((t) => t.name === 'log_workout_exercises')!;
    expect(log.description).toMatch(/REPLACES ALL/);
    expect(log.description).toMatch(/get_workout/);
  });

  it('answers 401 without a Bearer header, pointing at the OAuth metadata, without touching the API', async () => {
    const res = await rawPost();
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}", scope="mygym"`);
    expect(seen).toHaveLength(0);
    expect(checks).toHaveLength(0);
  });

  it('answers a real HTTP 401 for a rejected token, so clients sign in again or refresh', async () => {
    const res = await rawPost(TOKENS.revoked);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${RESOURCE_METADATA}", scope="mygym", error="invalid_token"`,
    );
    expect(seen).toHaveLength(0);
  });

  it('checks the token with the API on every request (an OAuth token can expire any moment)', async () => {
    for (let i = 0; i < 3; i++) expect((await rawPost(TOKENS.alice)).status).toBe(200);
    expect(checks).toEqual([TOKENS.alice, TOKENS.alice, TOKENS.alice]);
  });

  it('lets the request through when the token check fails with a server error', async () => {
    expect((await rawPost(TOKENS.checkFails)).status).toBe(200);
  });

  it('lets the request through when the API is unreachable (tools report it)', async () => {
    const offline = buildApp({ apiUrl: 'http://127.0.0.1:1/api', publicUrl: PUBLIC_URL, logger: false });
    const url = `${await offline.listen({ port: 0, host: '127.0.0.1' })}/mcp`;
    try {
      expect((await rawPost(TOKENS.alice, url)).status).toBe(200);
    } finally {
      await offline.close();
    }
  });

  it('refuses GET/DELETE (stateless: no stream, no session)', async () => {
    expect((await fetch(mcpUrl)).status).toBe(405);
    expect((await fetch(mcpUrl, { method: 'DELETE' })).status).toBe(405);
  });

  it('has a health check', async () => {
    const res = await fetch(new URL('/health', mcpUrl));
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('forwarding to the MyGym API', () => {
  it("passes the caller's Authorization header through unchanged", async () => {
    const client = await connect(TOKENS.alice);
    const result = await client.callTool({ name: 'list_exercises', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toEqual([{ id: 'ex-1', name: "alice's squat" }]);
    expect(seen).toEqual([expect.objectContaining({ method: 'GET', url: '/api/exercises', authorization: TOKENS.alice })]);
  });

  it('sends log_workout_exercises as a PUT of the whole list', async () => {
    const client = await connect(TOKENS.alice);
    const workoutId = '11111111-1111-4111-8111-111111111111';
    const exercises = [
      {
        exerciseId: '22222222-2222-4222-8222-222222222222',
        weightPerUnitKg: 22.5,
        weightUnits: 2,
        sets: [
          { setNumber: 1, reps: 8 },
          { setNumber: 2, reps: 8 },
        ],
      },
    ];
    const result = await client.callTool({ name: 'log_workout_exercises', arguments: { workoutId, exercises } });

    expect(result.isError).toBeFalsy();
    expect(seen).toEqual([
      expect.objectContaining({ method: 'PUT', url: `/api/workouts/${workoutId}/exercises`, body: { exercises } }),
    ]);
  });

  it('accepts numbers as strings, the way get_workout returns weights ("22.50")', async () => {
    const client = await connect(TOKENS.alice);
    const workoutId = '11111111-1111-4111-8111-111111111111';
    const result = await client.callTool({
      name: 'log_workout_exercises',
      arguments: {
        workoutId,
        exercises: [
          {
            exerciseId: '22222222-2222-4222-8222-222222222222',
            weightPerUnitKg: '22.50',
            weightUnits: 2,
            sets: [{ setNumber: 1, reps: 8 }],
          },
        ],
      },
    });

    expect(result.isError).toBeFalsy();
    expect((seen[0].body as { exercises: { weightPerUnitKg: unknown }[] }).exercises[0].weightPerUnitKg).toBe(22.5);
  });

  it('rejects malformed input before calling the API', async () => {
    const client = await connect(TOKENS.alice);
    const result = await client.callTool({ name: 'get_workout', arguments: { workoutId: 'not-a-uuid' } });
    expect(result.isError).toBe(true);
    expect(seen).toHaveLength(0);
  });
});

describe('isolation between users', () => {
  it('two tokens at the same time each get only their own data', async () => {
    const [alice, bob] = await Promise.all([connect(TOKENS.alice), connect(TOKENS.bob)]);

    const calls = Array.from({ length: 6 }, (_, i) => (i % 2 === 0 ? ['alice', alice] : ['bob', bob]) as const);
    const results = await Promise.all(
      calls.map(async ([who, client]) => ({
        who,
        data: JSON.parse(text(await client.callTool({ name: 'list_recent_workouts', arguments: {} }))),
      })),
    );

    for (const { who, data } of results) {
      expect(data.data[0].id).toBe(`${who}-workout`);
    }
    const workoutCalls = seen.filter((s) => s.url.startsWith('/api/workouts'));
    expect(workoutCalls.filter((s) => s.authorization === TOKENS.alice)).toHaveLength(3);
    expect(workoutCalls.filter((s) => s.authorization === TOKENS.bob)).toHaveLength(3);
  });
});

describe('errors', () => {
  it('turns a token revoked after the check into a tool error and keeps serving other users', async () => {
    const revoked = await connect(TOKENS.revokedMidway);
    const result = await revoked.callTool({ name: 'list_exercises', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/invalid, expired or was revoked/);
    expect(text(result)).toMatch(/Integrations/);

    const alice = await connect(TOKENS.alice);
    expect((await alice.callTool({ name: 'list_exercises', arguments: {} })).isError).toBeFalsy();
  });

  it('reports validation errors with the API error code and fields', async () => {
    const client = await connect(TOKENS.alice);
    const result = await client.callTool({
      name: 'create_exercise',
      arguments: { name: 'Curl', equipment: 'dumbbell', category: 'small', repRangeMin: 12, repRangeMax: 8 },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/validation_error/);
    expect(text(result)).toMatch(/rep_range_invalid/);
  });

  it('hides server error details', async () => {
    const client = await connect(TOKENS.alice);
    const result = await client.callTool({ name: 'get_progression_overview', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('MyGym server error. Try again later.');
  });
});

describe('rate limit', () => {
  it(`allows ${MCP_RATE_LIMIT.max} requests a minute per token, independently for each token`, async () => {
    const post = (authorization: string) => rawPost(authorization);

    for (let i = 0; i < MCP_RATE_LIMIT.max; i++) {
      expect((await post(TOKENS.alice)).status).toBe(200);
    }
    expect((await post(TOKENS.alice)).status).toBe(429);
    expect((await post(TOKENS.bob)).status).toBe(200);
  });
});

describe('no user tokens in the service', () => {
  it('has no real-looking personal access token anywhere in src/', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(join(__dirname, '..', 'src'));
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/mygym_pat_[0-9a-f]{16,}/);
    }
  });
});
