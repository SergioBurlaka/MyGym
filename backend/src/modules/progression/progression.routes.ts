import type { FastifyInstance } from 'fastify';
import { getProgressionOverview, getExerciseHistory } from './progression.service.js';

export default async function progressionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return getProgressionOverview(request.userId);
  });

  fastify.get<{ Params: { exerciseId: string } }>('/:exerciseId/history', async (request) => {
    return getExerciseHistory(request.userId, request.params.exerciseId);
  });
}
