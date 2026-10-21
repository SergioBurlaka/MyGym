import crypto from 'node:crypto';
import Fastify, { type FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createApiClient } from './apiClient.js';
import { createMcpServer } from './createMcpServer.js';

// Per token, so one user's runaway agent can't starve the others (and a
// missing header shares one bucket per IP).
export const MCP_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

// A token the API accepted recently isn't re-checked for this long. Only
// decides whether to answer 401 up front: every tool call still goes to the
// API with the token, which rejects a revoked one there and then.
const TOKEN_CHECK_CACHE_MS = 60_000;
const TOKEN_CHECK_TIMEOUT_MS = 5_000;

function jsonRpcError(reply: FastifyReply, status: number, code: number, message: string) {
  return reply.code(status).send({ jsonrpc: '2.0', error: { code, message }, id: null });
}

export function buildApp({ apiUrl, publicUrl, logger = true }: { apiUrl: string; publicUrl: string; logger?: boolean }) {
  // RFC 9728: a 401 points MCP clients (Claude, ChatGPT) at the metadata that
  // says where to sign in - that's what turns on their "Sign in" button.
  const challenge = (error?: string) =>
    [
      `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp"`,
      'scope="mygym"',
      ...(error ? [`error="${error}"`] : []),
    ].join(', ');

  const validUntil = new Map<string, number>();
  // false only on a real 401 from the API. Unreachable API -> let the request
  // through: the tools report that better than a misleading "sign in again".
  async function tokenAccepted(authorization: string, key: string) {
    if ((validUntil.get(key) ?? 0) > Date.now()) return true;
    let status: number;
    try {
      const res = await fetch(`${apiUrl}/settings`, {
        headers: { authorization },
        signal: AbortSignal.timeout(TOKEN_CHECK_TIMEOUT_MS),
      });
      await res.body?.cancel();
      status = res.status;
    } catch {
      return true;
    }
    if (status === 401) {
      validUntil.delete(key);
      return false;
    }
    if (status < 400) {
      if (validUntil.size > 10_000) validUntil.clear();
      validUntil.set(key, Date.now() + TOKEN_CHECK_CACHE_MS);
    }
    return true;
  }

  // Behind the top-level nginx - same single trusted hop as the backend.
  const app = Fastify({ logger, trustProxy: (_addr: string, hop: number) => hop === 0 });

  app.register(rateLimit, { global: false });

  // Routes go inside a plugin: registered at the root they would be added
  // before @fastify/rate-limit has loaded, and their rateLimit config would
  // silently do nothing (caught by the rate-limit test).
  app.register(async (routes) => {
    // Polled by the Docker healthcheck every 30 s - keep it out of the log.
    routes.get('/health', { logLevel: 'warn' }, async () => ({ ok: true }));

    routes.post(
      '/mcp',
      {
        config: {
          rateLimit: {
            ...MCP_RATE_LIMIT,
            // Hash, never the raw token, as the bucket key.
            keyGenerator: (request) => {
              const auth = request.headers.authorization;
              return auth ? crypto.createHash('sha256').update(auth).digest('hex') : `ip:${request.ip}`;
            },
          },
        },
      },
      async (request, reply) => {
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith('Bearer ')) {
          reply.header('www-authenticate', challenge());
          return jsonRpcError(reply, 401, -32001, 'Missing "Authorization: Bearer <MyGym access token>" header');
        }
        // The API decides whose token it is; asking it here only lets an
        // expired or revoked token get a real HTTP 401 - clients start
        // "Sign in" / refresh on that, not on a tool error inside a 200.
        const key = crypto.createHash('sha256').update(authorization).digest('hex');
        if (!(await tokenAccepted(authorization, key))) {
          reply.header('www-authenticate', challenge('invalid_token'));
          return jsonRpcError(reply, 401, -32001, 'The MyGym access token is invalid, expired or revoked');
        }

        // Stateless: a fresh server + transport per request, bound to this
        // caller's token, thrown away when the response is done.
        const server = createMcpServer(createApiClient(apiUrl, authorization));
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        reply.hijack();
        reply.raw.on('close', () => {
          void transport.close();
          void server.close();
        });
        try {
          await server.connect(transport);
          await transport.handleRequest(request.raw, reply.raw, request.body);
        } catch (err) {
          // After hijack() Fastify no longer answers for us - without this the
          // client would wait for nginx's timeout.
          request.log.error({ err }, 'MCP request failed');
          if (!reply.raw.headersSent) {
            reply.raw.writeHead(500, { 'content-type': 'application/json' });
          }
          reply.raw.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }));
        }
      },
    );

    // Stateless mode has no server-initiated stream or session to delete.
    const notAllowed = async (_request: unknown, reply: FastifyReply) =>
      jsonRpcError(reply.header('allow', 'POST'), 405, -32000, 'Method not allowed');
    routes.get('/mcp', notAllowed);
    routes.delete('/mcp', notAllowed);
  });

  return app;
}
