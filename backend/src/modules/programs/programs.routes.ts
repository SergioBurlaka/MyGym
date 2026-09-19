import type { FastifyInstance } from 'fastify';
import { saveProgramSchema } from './programs.schema.js';
import { listPrograms, getProgram, createProgram, updateProgram, deleteProgram } from './programs.service.js';

export default async function programsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request) => {
    return listPrograms(request.userId);
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const program = await getProgram(request.userId, request.params.id);
    if (!program) return reply.code(404).send({ error: 'not_found' });
    return program;
  });

  fastify.post('/', async (request, reply) => {
    const parsed = saveProgramSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    try {
      const program = await createProgram(request.userId, parsed.data);
      return reply.code(201).send(program);
    } catch (err) {
      return reply.code(400).send({ error: 'invalid_exercises', message: (err as Error).message });
    }
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = saveProgramSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    try {
      const program = await updateProgram(request.userId, request.params.id, parsed.data);
      if (!program) return reply.code(404).send({ error: 'not_found' });
      return program;
    } catch (err) {
      return reply.code(400).send({ error: 'invalid_exercises', message: (err as Error).message });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const ok = await deleteProgram(request.userId, request.params.id);
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ ok: true });
  });
}
