import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { verifyAccessToken } from '../utils/tokens.js';

// Registers a `fastify.authenticate` preHandler that routes can opt into.
// It reads the "Authorization: Bearer <token>" header, verifies it, and
// attaches userId/userEmail to the request.
export default fp(async function authenticatePlugin(fastify: FastifyInstance) {
  fastify.decorate('authenticate', async (request, reply) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing_token', message: 'Authorization header is required' });
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = verifyAccessToken(token);
      request.userId = payload.sub;
      request.userEmail = payload.email;
    } catch {
      return reply.code(401).send({ error: 'invalid_token', message: 'Access token is invalid or expired' });
    }
  });
});
