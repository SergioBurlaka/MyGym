import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { PAT_PREFIX, verifyAccessToken } from '../utils/tokens.js';
import { findUserByApiToken } from '../modules/apiTokens/apiTokens.service.js';

// Registers a `fastify.authenticate` preHandler that routes can opt into.
// It reads the "Authorization: Bearer <token>" header, verifies it, and
// attaches userId/userEmail to the request. The token is either a JWT access
// token (browser session) or a personal access token "mygym_pat_..." (a
// program like the MCP server) - everything downstream scopes data by
// request.userId the same way for both.
export default fp(async function authenticatePlugin(fastify: FastifyInstance) {
  fastify.decorate('authenticate', async (request, reply) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing_token', message: 'Authorization header is required' });
    }
    const token = header.slice('Bearer '.length);

    if (token.startsWith(PAT_PREFIX)) {
      const owner = await findUserByApiToken(token);
      if (!owner) {
        return reply.code(401).send({ error: 'invalid_token', message: 'Access token is invalid or revoked' });
      }
      request.userId = owner.userId;
      request.userEmail = owner.email;
      request.authMethod = 'pat';
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      request.userId = payload.sub;
      request.userEmail = payload.email;
      request.authMethod = 'session';
    } catch {
      return reply.code(401).send({ error: 'invalid_token', message: 'Access token is invalid or expired' });
    }
  });
});
