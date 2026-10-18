import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyError } from 'fastify';

// One response shape for everything that isn't handled inside a route:
// `{ error: <stable code>, message }` - the same contract the routes use, so
// the frontend's translateApiError() can translate it via `errors.<code>`.
// Unexpected (5xx) errors are logged with the stack but never echoed back
// to the client, so SQL/driver details don't leak.
export default fp(async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler((err: FastifyError, request, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;

    if (status === 429) {
      return reply.code(429).send({ error: 'too_many_requests', message: 'Too many attempts, try again later' });
    }

    if (status < 500) {
      // Fastify's own client errors: malformed JSON, wrong content-type,
      // body too large, ...
      return reply.code(status).send({ error: 'bad_request', message: err.message });
    }

    request.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error', message: 'Internal server error' });
  });
});
