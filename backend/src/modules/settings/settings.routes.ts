import type { FastifyInstance } from 'fastify';
import { updateSettingsSchema } from './settings.schema.js';
import { getScheduleHistory, getSettings, updateSettings } from './settings.service.js';

export default async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const settings = await getSettings(request.userId);
    if (!settings) return reply.code(404).send({ error: 'not_found' });
    return settings;
  });

  fastify.get('/history', async (request) => {
    return getScheduleHistory(request.userId);
  });

  fastify.patch('/', async (request, reply) => {
    const parsed = updateSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    const settings = await updateSettings(request.userId, parsed.data);
    if (!settings) return reply.code(404).send({ error: 'not_found' });
    return settings;
  });
}
