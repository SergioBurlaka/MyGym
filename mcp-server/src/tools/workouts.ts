import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../apiClient.js';
import { apiResult } from './result.js';

const id = z.string().uuid();

// Mirrors backend/src/modules/workouts/workouts.schema.ts.
export function registerWorkoutTools(server: McpServer, api: ApiClient) {
  server.registerTool(
    'list_recent_workouts',
    {
      title: 'List recent workouts',
      description: 'Lists the most recent workouts (newest first) with date, program label and exercises. Use page for older ones.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe('How many workouts per page (default 10)'),
        page: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, page }) => apiResult(() => api.get(`/workouts?pageSize=${limit ?? 10}&page=${page ?? 1}`)),
  );

  server.registerTool(
    'get_workout',
    {
      title: 'Get workout',
      description: 'Returns one workout with all its exercises, weights and sets.',
      inputSchema: { workoutId: id },
      annotations: { readOnlyHint: true },
    },
    async ({ workoutId }) => apiResult(() => api.get(`/workouts/${workoutId}`)),
  );

  server.registerTool(
    'start_workout',
    {
      title: 'Start workout',
      description:
        "Creates a new workout (today unless date is given). With programId it is pre-filled from that program: its exercises and number of sets, with weight and reps taken from each exercise's last session. Without it the workout is empty - add exercises with log_workout_exercises.",
      inputSchema: {
        programId: id.optional().describe('Start from this program (see list_programs / get_suggested_program)'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('YYYY-MM-DD, for logging a past workout'),
      },
    },
    async (input) => apiResult(() => api.post('/workouts', input)),
  );

  // PUT replaces the whole list (that's what the app's autosave relies on).
  // Agreed with the user: keep the backend as is and make the description
  // impossible to misread, rather than add merge logic here.
  server.registerTool(
    'log_workout_exercises',
    {
      title: 'Save workout exercises',
      description:
        'REPLACES ALL exercises and sets of the workout with exactly the list you pass - anything not in the list is DELETED. ' +
        'To add or change one exercise, first call get_workout, take its current exercises, modify that list and pass the whole list back. ' +
        'Weight is fixed per exercise: weightPerUnitKg is the load on ONE side of the bar / ONE dumbbell, weightUnits is how many (usually 2); omit both for bodyweight. ' +
        'Each set has setNumber (1, 2, 3...) and reps.',
      inputSchema: {
        workoutId: id,
        exercises: z.array(
          z.object({
            exerciseId: id,
            weightPerUnitKg: z.number().min(0).max(500).nullable().optional(),
            weightUnits: z.number().int().min(1).max(2).nullable().optional(),
            notes: z.string().max(500).nullable().optional(),
            sets: z
              .array(z.object({ setNumber: z.number().int().min(1), reps: z.number().int().min(0).max(200) }))
              .min(1),
          }),
        ),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ workoutId, exercises }) => apiResult(() => api.put(`/workouts/${workoutId}/exercises`, { exercises })),
  );

  server.registerTool(
    'finish_workout',
    {
      title: 'Finish workout',
      description: 'Marks the workout as finished (records its end time).',
      inputSchema: { workoutId: id },
    },
    async ({ workoutId }) => apiResult(() => api.post(`/workouts/${workoutId}/finish`)),
  );
}
