import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import authenticatePlugin from './plugins/authenticate.js';
import idParamsPlugin from './plugins/idParams.js';
import errorHandlerPlugin from './plugins/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import exercisesRoutes from './modules/exercises/exercises.routes.js';
import workoutsRoutes from './modules/workouts/workouts.routes.js';
import progressionRoutes from './modules/progression/progression.routes.js';
import csvImportRoutes from './modules/import/csvImport.routes.js';
import programsRoutes from './modules/programs/programs.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import apiTokensRoutes from './modules/apiTokens/apiTokens.routes.js';
import wellKnownRoutes from './modules/oauth/wellKnown.routes.js';

export type BuildAppOptions = {
  // Tests pass `false` to keep the pino output quiet.
  logger?: boolean;
};

export function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({
    // Behind exactly one nginx hop: trust X-Forwarded-Proto so
    // request.protocol reflects the client's real scheme (used for the
    // refresh cookie's Secure flag), and take request.ip from the address
    // nginx itself appended to X-Forwarded-For. `true` would trust the whole
    // header - i.e. the left-most, client-supplied value - which would let
    // anyone dodge the per-IP auth rate limit by sending a fake header.
    trustProxy: (_address: string, hop: number) => hop === 0,
    logger:
      opts.logger === false
        ? false
        : {
            level: env.NODE_ENV === 'production' ? 'info' : 'debug',
            transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
          },
  });

  app.register(errorHandlerPlugin);

  app.register(cors, {
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.register(cookie);
  app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB is plenty for a CSV export
  });
  // Opt-in per route (see auth.routes.ts) - only the endpoints that check a
  // password are worth throttling; refresh is hit by every open tab.
  app.register(rateLimit, { global: false });
  app.register(authenticatePlugin);
  app.register(idParamsPlugin);

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(exercisesRoutes, { prefix: '/api/exercises' });
  app.register(workoutsRoutes, { prefix: '/api/workouts' });
  app.register(progressionRoutes, { prefix: '/api/progression' });
  app.register(csvImportRoutes, { prefix: '/api/import' });
  app.register(programsRoutes, { prefix: '/api/programs' });
  app.register(settingsRoutes, { prefix: '/api/settings' });
  app.register(apiTokensRoutes, { prefix: '/api/tokens' });
  app.register(wellKnownRoutes);

  return app;
}
