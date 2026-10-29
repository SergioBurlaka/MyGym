import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../apiClient.js';
import { apiResult } from './result.js';

// Input rules mirror backend/src/modules/exercises/exercises.schema.ts; the
// backend validates again and stays the source of truth.
export function registerExerciseTools(server: McpServer, api: ApiClient) {
  server.registerTool(
    'list_exercises',
    {
      title: 'List exercises',
      description:
        "Lists the user's exercises with their ids, equipment, category (large / small / bodyweight muscle group), rep range, weight step, " +
        'unilateral (left and right one after the other - reps are logged per side; limb says arm or leg) and defaultBarKg (barbell). ' +
        'Call this first to find the exerciseId for any other tool.',
      annotations: { readOnlyHint: true },
    },
    async () => apiResult(() => api.get('/exercises')),
  );

  server.registerTool(
    'create_exercise',
    {
      title: 'Create exercise',
      description:
        "Adds a new exercise to the user's list. category: 'large' for big compound lifts (squat, deadlift, bench), 'small' for isolation / injury-sensitive ones, 'bodyweight' for no external load. weightStepKg is the per-side increment suggested when progressing. " +
        'unilateral: true when each arm / leg works on its own one after the other (alternating curls, lunges) - then limb is arm or leg. ' +
        'defaultBarKg: barbell only, the usual bar (20 if omitted; 0 = no bar).',
      inputSchema: {
        name: z.string().min(1).max(120),
        equipment: z.enum(['barbell', 'dumbbell', 'bodyweight']),
        category: z.enum(['large', 'small', 'bodyweight']),
        repRangeMin: z.coerce.number().int().min(1).max(100),
        repRangeMax: z.coerce.number().int().min(1).max(100),
        weightStepKg: z.coerce.number().min(0).max(50).optional(),
        unilateral: z.boolean().optional(),
        limb: z.enum(['arm', 'leg']).nullable().optional(),
        defaultBarKg: z.coerce.number().min(0).max(50).nullable().optional(),
      },
    },
    async (input) => apiResult(() => api.post('/exercises', input)),
  );
}
