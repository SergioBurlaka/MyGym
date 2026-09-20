import type { FastifyInstance } from 'fastify';
import { importWorkoutCsv } from './csvImport.service.js';

export default async function csvImportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/csv', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: 'no_file', message: 'Attach a CSV file' });
    }
    const buffer = await file.toBuffer();
    const content = buffer.toString('utf-8');

    try {
      const summary = await importWorkoutCsv(request.userId, content);
      return reply.send(summary);
    } catch (err) {
      request.log.error(err);
      return reply.code(400).send({ error: 'import_failed', message: (err as Error).message });
    }
  });
}
