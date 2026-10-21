import type { FastifyInstance } from 'fastify';
import { requireSession } from '../../plugins/authenticate.js';
import { createApiTokenSchema } from './apiTokens.schema.js';
import { ApiTokenError, createApiToken, listApiTokens, revokeApiToken } from './apiTokens.service.js';

export default async function apiTokensRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // Managing tokens needs the person, not a program: a leaked PAT must not
  // be able to mint itself fresh tokens (revoking the leaked one would then
  // achieve nothing) or revoke the owner's other integrations.
  fastify.addHook('preHandler', requireSession);

  fastify.get('/', async (request) => {
    return listApiTokens(request.userId);
  });

  fastify.post('/', async (request, reply) => {
    const parsed = createApiTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    try {
      const token = await createApiToken(request.userId, parsed.data.name);
      return reply.code(201).send(token);
    } catch (err) {
      if (err instanceof ApiTokenError) {
        return reply.code(409).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const revoked = await revokeApiToken(request.userId, request.params.id);
    if (!revoked) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.send({ ok: true });
  });
}
