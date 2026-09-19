import type { FastifyInstance } from 'fastify';
import { createExerciseSchema, updateExerciseSchema } from './exercises.schema.js';
import { listExercises, createExercise, updateExercise, archiveExercise } from './exercises.service.js';

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
    const exercise = await createExercise(request.userId, parsed.data);
    return reply.code(201).send(exercise);
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = updateExerciseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    const exercise = await updateExercise(request.userId, request.params.id, parsed.data);
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
