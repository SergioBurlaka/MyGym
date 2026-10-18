import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every path parameter named `id` or `<something>Id` is a uuid primary key.
// Without this check a malformed value (`/api/workouts/abc`) reached
// Postgres, which rejected the cast with `invalid input syntax for type
// uuid` - surfacing as a 500 instead of a client error.
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export default fp(async function idParamsPlugin(fastify: FastifyInstance) {
  fastify.addHook('preValidation', async (request, reply) => {
    const params = (request.params ?? {}) as Record<string, string>;
    for (const [name, value] of Object.entries(params)) {
      if ((name === 'id' || name.endsWith('Id')) && !isUuid(value)) {
        return reply.code(400).send({ error: 'invalid_id', message: `${name} must be a UUID` });
      }
    }
  });
});
