import type { FastifyInstance } from 'fastify';
import { authorizationServerMetadata, protectedResourceMetadata } from './oauth.config.js';

// The discovery documents MCP clients fetch before signing in. Registered
// at the root, not under /api: their paths are fixed by RFC 8414 / 9728.
export default async function wellKnownRoutes(fastify: FastifyInstance) {
  // Claude and ChatGPT fetch these server-side; CORS only matters for
  // browser-based clients (MCP Inspector) and the documents are public.
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('access-control-allow-origin', '*');
  });

  fastify.get('/.well-known/oauth-authorization-server', async () => authorizationServerMetadata());

  // Clients try the path form (resource at /mcp) first, then the root one.
  fastify.get('/.well-known/oauth-protected-resource/mcp', async () => protectedResourceMetadata());
  fastify.get('/.well-known/oauth-protected-resource', async () => protectedResourceMetadata());
}
