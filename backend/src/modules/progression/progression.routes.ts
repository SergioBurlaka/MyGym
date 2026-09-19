import type { FastifyInstance } from 'fastify';
import { getProgressionOverview, getExerciseHistory, getVolumeByCategory } from './progression.service.js';

export default async function progressionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return getProgressionOverview(request.userId);
  });

  fastify.get<{ Querystring: { weeks?: string } }>('/volume-by-category', async (request) => {
    const weeks = Number(request.query.weeks);
    return getVolumeByCategory(request.userId, Number.isFinite(weeks) ? Math.min(Math.max(weeks, 1), 52) : 12);
  });

  fastify.get<{ Params: { exerciseId: string } }>('/:exerciseId/history', async (request) => {
    return getExerciseHistory(request.userId, request.params.exerciseId);
  });
}
