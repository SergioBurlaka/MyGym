import crypto from 'node:crypto';
import Fastify, { type FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createApiClient } from './apiClient.js';
import { createMcpServer } from './createMcpServer.js';

// Per token, so one user's runaway agent can't starve the others (and a
// missing header shares one bucket per IP).
export const MCP_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

function jsonRpcError(reply: FastifyReply, status: number, code: number, message: string) {
  return reply.code(status).send({ jsonrpc: '2.0', error: { code, message }, id: null });
}

export function buildApp({ apiUrl, logger = true }: { apiUrl: string; logger?: boolean }) {
  // Behind the top-level nginx - same single trusted hop as the backend.
  const app = Fastify({ logger, trustProxy: (_addr: string, hop: number) => hop === 0 });

  app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ ok: true }));

  app.post(
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
      // The token itself is NOT checked here - it is passed through to the
      // MyGym API, which decides whose account it is (or rejects it).
      if (!authorization?.startsWith('Bearer ')) {
        return jsonRpcError(reply, 401, -32001, 'Missing "Authorization: Bearer <MyGym access token>" header');
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
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    },
  );

  // Stateless mode has no server-initiated stream or session to delete.
  const notAllowed = async (_request: unknown, reply: FastifyReply) =>
    jsonRpcError(reply.header('allow', 'POST'), 405, -32000, 'Method not allowed');
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);

  return app;
}
