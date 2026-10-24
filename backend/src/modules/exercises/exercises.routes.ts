import type { FastifyInstance } from 'fastify';
import { createExerciseSchema, updateExerciseSchema } from './exercises.schema.js';
import {
  listExercises,
  createExercise,
  updateExercise,
  archiveExercise,
  ExerciseNameTakenError,
  ExerciseRepRangeError,
} from './exercises.service.js';

function exerciseErrorReply(err: unknown) {
  if (err instanceof ExerciseNameTakenError) return { status: 409, body: { error: 'exercise_name_taken' } };
  if (err instanceof ExerciseRepRangeError) return { status: 400, body: { error: 'rep_range_invalid' } };
  return null;
}

export default async function exercisesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return listExercises(request.userId);
  });

  fastify.post('/', async (request, reply) => {
    const parsed = createExerciseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    try {
      const exercise = await createExercise(request.userId, parsed.data);
      return reply.code(201).send(exercise);
    } catch (err) {
      const known = exerciseErrorReply(err);
      if (known) return reply.code(known.status).send(known.body);
      throw err;
    }
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = updateExerciseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    let exercise;
    try {
      exercise = await updateExercise(request.userId, request.params.id, parsed.data);
    } catch (err) {
      const known = exerciseErrorReply(err);
      if (known) return reply.code(known.status).send(known.body);
      throw err;
    }
    if (!exercise) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return exercise;
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const exercise = await archiveExercise(request.userId, request.params.id);
    if (!exercise) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.send({ ok: true });
  });
}
