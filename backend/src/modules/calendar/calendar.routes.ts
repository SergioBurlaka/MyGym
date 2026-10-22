import type { FastifyInstance } from 'fastify';
import { requireSession } from '../../plugins/authenticate.js';
import { createCalendarTokenSchema, feedParamsSchema, feedQuerySchema } from './calendar.schema.js';
import { createCalendarFeedToken, deleteCalendarFeedToken, renderCalendarFeed } from './calendar.service.js';

// Keyed by the feed file, not the IP: Google fetches every subscribed
// calendar from a shared pool of its own addresses, so a per-IP limit would
// make users throttle each other. Clients poll every few hours at most.
export const FEED_RATE_LIMIT = {
  max: 60,
  timeWindow: '1 hour',
  keyGenerator: (request: { params: unknown; ip: string }) =>
    (request.params as { file?: string }).file ?? request.ip,
};

export default async function calendarRoutes(fastify: FastifyInstance) {
  // Minting or dropping the secret URL needs the person, not a program - like
  // /api/tokens, a leaked PAT must not be able to mint itself more secrets.
  const sessionOnly = { preHandler: [fastify.authenticate, requireSession] };

  fastify.post('/token', sessionOnly, async (request, reply) => {
    const parsed = createCalendarTokenSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    return reply.code(201).send(await createCalendarFeedToken(request.userId, parsed.data.lang));
  });

  fastify.delete('/token', sessionOnly, async (request) => {
    await deleteCalendarFeedToken(request.userId);
    return { ok: true };
  });

  // Public: calendar apps can't send a bearer token, the secret is in the URL.
  // A malformed or unknown token is 404, not 401, so the response doesn't
  // confirm that a token exists.
  fastify.get('/feed/:file', { config: { rateLimit: FEED_RATE_LIMIT } }, async (request, reply) => {
    const params = feedParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: 'not_found' });
    const { lang } = feedQuerySchema.parse(request.query ?? {});

    const ics = await renderCalendarFeed(params.data.file.slice(0, -'.ics'.length), lang);
    if (ics === null) return reply.code(404).send({ error: 'not_found' });

    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Cache-Control', 'no-cache')
      .header('Content-Disposition', 'inline; filename="mygym.ics"')
      .send(ics);
  });
}
