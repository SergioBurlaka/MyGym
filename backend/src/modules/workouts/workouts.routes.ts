import type { FastifyInstance } from 'fastify';
import { startWorkoutSchema, saveWorkoutExercisesSchema } from './workouts.schema.js';
import {
  startWorkout,
  finishWorkout,
  listWorkouts,
  getWorkout,
  deleteWorkout,
  saveWorkoutExercises,
} from './workouts.service.js';

export default async function workoutsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get<{ Querystring: { page?: string; pageSize?: string } }>('/', async (request) => {
    const page = Number(request.query.page);
    const pageSize = Number(request.query.pageSize);
    return listWorkouts(request.userId, {
      page: Number.isFinite(page) ? page : undefined,
      pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    });
  });

  fastify.post('/', async (request, reply) => {
    const parsed = startWorkoutSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    const workout = await startWorkout(request.userId, parsed.data.date);
    return reply.code(201).send(workout);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const workout = await getWorkout(request.userId, request.params.id);
    if (!workout) return reply.code(404).send({ error: 'not_found' });
    return workout;
  });

  fastify.put<{ Params: { id: string } }>('/:id/exercises', async (request, reply) => {
    const parsed = saveWorkoutExercisesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    try {
      const workout = await saveWorkoutExercises(request.userId, request.params.id, parsed.data);
      if (!workout) return reply.code(404).send({ error: 'not_found' });
      return workout;
    } catch (err) {
      return reply.code(400).send({ error: 'invalid_exercises', message: (err as Error).message });
    }
  });

  fastify.post<{ Params: { id: string } }>('/:id/finish', async (request, reply) => {
    const workout = await finishWorkout(request.userId, request.params.id);
    if (!workout) return reply.code(404).send({ error: 'not_found' });
    return workout;
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const ok = await deleteWorkout(request.userId, request.params.id);
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ ok: true });
  });
}
