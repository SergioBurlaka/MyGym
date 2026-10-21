import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../apiClient.js';
import { apiResult } from './result.js';

// Mirrors backend/src/modules/programs/programs.schema.ts.
export function registerProgramTools(server: McpServer, api: ApiClient) {
  server.registerTool(
    'list_programs',
    {
      title: 'List programs',
      description: "Lists the user's training programs (e.g. an A / B rotation) with their exercises and target number of sets.",
      annotations: { readOnlyHint: true },
    },
    async () => apiResult(() => api.get('/programs')),
  );

  server.registerTool(
    'create_program',
    {
      title: 'Create program',
      description:
        'Creates a reusable training program. Exercises are done in the order given. Weights are not stored in a program - when a workout is started from it, each exercise gets its last used weight and reps.',
      inputSchema: {
        name: z.string().min(1).max(50),
        exercises: z
          .array(z.object({ exerciseId: z.string().uuid(), targetSets: z.number().int().min(1).max(20) }))
          .min(1),
        tryMoreAfterWorkouts: z
          .number()
          .int()
          .min(1)
          .max(60)
          .nullable()
          .optional()
          .describe('Nudge to try more after this many sessions without progress (instead of the default 14 days)'),
      },
    },
    async (input) => apiResult(() => api.post('/programs', input)),
  );

  server.registerTool(
    'get_suggested_program',
    {
      title: 'Suggested next program',
      description: 'Returns the program that is next in the rotation after the last workout started from a program. Only a suggestion.',
      annotations: { readOnlyHint: true },
    },
    async () => apiResult(() => api.get('/programs/suggestion')),
  );
}
