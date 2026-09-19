import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import authenticatePlugin from './plugins/authenticate.js';
import authRoutes from './modules/auth/auth.routes.js';
import exercisesRoutes from './modules/exercises/exercises.routes.js';
import workoutsRoutes from './modules/workouts/workouts.routes.js';
import progressionRoutes from './modules/progression/progression.routes.js';
import csvImportRoutes from './modules/import/csvImport.routes.js';
import programsRoutes from './modules/programs/programs.routes.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
  });

  app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.register(cookie);
  app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB is plenty for a CSV export
  });
  app.register(authenticatePlugin);

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(exercisesRoutes, { prefix: '/api/exercises' });
  app.register(workoutsRoutes, { prefix: '/api/workouts' });
  app.register(progressionRoutes, { prefix: '/api/progression' });
  app.register(csvImportRoutes, { prefix: '/api/import' });
  app.register(programsRoutes, { prefix: '/api/programs' });

  return app;
}
