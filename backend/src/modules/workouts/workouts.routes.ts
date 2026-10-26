import type { FastifyInstance } from 'fastify';
import { startWorkoutSchema, saveWorkoutExercisesSchema, updateWorkoutSchema } from './workouts.schema.js';
import {
  startWorkout,
  finishWorkout,
  listWorkouts,
  listWorkoutDates,
  getWorkout,
  deleteWorkout,
  saveWorkoutExercises,
  updateWorkout,
  listWorkoutTemplates,
  withProgressAt,
  getActiveWorkout,
  setWorkoutPaused,
} from './workouts.service.js';
import { removeSampleWorkouts } from '../template/template.service.js';

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
    const workout = await startWorkout(request.userId, parsed.data);
    return reply.code(201).send(workout);
  });

  fastify.get('/templates', async (request) => {
    return listWorkoutTemplates(request.userId);
  });

  // Wrapped, not a bare null: "no open workout" is a normal answer.
  // serverNow lets the header timer correct for a phone clock that is off -
  // timeStart and pausedAt are server times.
  fastify.get('/active', async (request) => {
    return { workout: await getActiveWorkout(request.userId), serverNow: new Date().toISOString() };
  });

  fastify.get<{ Querystring: { from?: string; to?: string } }>('/dates', async (request, reply) => {
    const { from, to } = request.query;
    if (!from || !to) {
      return reply.code(400).send({ error: 'validation_error', message: 'from and to are required (YYYY-MM-DD)' });
    }
    return listWorkoutDates(request.userId, from, to);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = updateWorkoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    const workout = await updateWorkout(request.userId, request.params.id, parsed.data);
    if (!workout) return reply.code(404).send({ error: 'not_found' });
    return workout;
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
    let workout: Awaited<ReturnType<typeof saveWorkoutExercises>>;
    try {
      workout = await saveWorkoutExercises(request.userId, request.params.id, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: 'invalid_exercises', message: (err as Error).message });
    }
    if (!workout) return reply.code(404).send({ error: 'not_found' });
    // Outside the try: a failure here isn't an invalid save - it's committed.
    return withProgressAt(request.userId, workout, (err) =>
      request.log.error({ err }, 'progressAt after workout save failed'),
    );
  });

  fastify.post<{ Params: { id: string } }>('/:id/finish', async (request, reply) => {
    const workout = await finishWorkout(request.userId, request.params.id);
    if (!workout) return reply.code(404).send({ error: 'not_found' });
    return workout;
  });

  for (const [action, paused] of [['pause', true], ['resume', false]] as const) {
    fastify.post<{ Params: { id: string } }>(`/:id/${action}`, async (request, reply) => {
      const workout = await setWorkoutPaused(request.userId, request.params.id, paused);
      if (!workout) return reply.code(404).send({ error: 'not_found' });
      if (workout === 'finished') return reply.code(409).send({ error: 'workout_finished' });
      return workout;
    });
  }

  // "Remove samples": every sample workout a new account started with.
  fastify.delete('/samples', async (request) => {
    return { removed: await removeSampleWorkouts(request.userId) };
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const ok = await deleteWorkout(request.userId, request.params.id);
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ ok: true });
  });
}
