import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../apiClient.js';
import { apiResult } from './result.js';

const id = z.string().uuid();

// Mirrors backend/src/modules/workouts/workouts.schema.ts - including
// z.coerce: numeric columns (weightPerUnitKg) come back from get_workout as
// strings like "22.50", and the description tells Claude to pass that list
// back as is.
export function registerWorkoutTools(server: McpServer, api: ApiClient) {
  server.registerTool(
    'list_recent_workouts',
    {
      title: 'List recent workouts',
      description: 'Lists the most recent workouts (newest first) with date, program label and exercises. Use page for older ones.',
      inputSchema: {
        limit: z.coerce.number().int().min(1).max(50).optional().describe('How many workouts per page (default 10)'),
        page: z.coerce.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, page }) => apiResult(() => api.get(`/workouts?pageSize=${limit ?? 10}&page=${page ?? 1}`)),
  );

  server.registerTool(
    'get_workout',
    {
      title: 'Get workout',
      description:
        'Returns one workout with all its exercises, weights and sets. Each exercise also has loadPerRepKg (weight moved in one rep), volumeKg, ' +
        'previous (the last session of that exercise before this workout: date, weight and reps per set) and target (when a "try more" is due: ' +
        "last time's reps with +1 in the set at upSetIndex - the weakest one). Weight fields mean what log_workout_exercises says.",
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
        "Weight is fixed per exercise and depends on the exercise's equipment (see list_exercises): " +
        "barbell - weightPerUnitKg is the plates on ONE side, barKg the bar (omit for the exercise's defaultBarKg; 0 = no bar), weightUnits is ignored (always 2 sides); " +
        'dumbbell - weightPerUnitKg is ONE dumbbell, weightUnits how many dumbbells move in ONE rep (2 = both together, 1 = one at a time / a single dumbbell); ' +
        'bodyweight - weightPerUnitKg is added weight, omit for none. ' +
        'Each set has setNumber (1, 2, 3...) and reps; for a unilateral exercise reps are PER SIDE (10 = 10 left + 10 right).',
      inputSchema: {
        workoutId: id,
        exercises: z.array(
          z.object({
            exerciseId: id,
            weightPerUnitKg: z.coerce.number().min(0).max(500).nullable().optional(),
            weightUnits: z.coerce.number().int().min(1).max(2).nullable().optional(),
            barKg: z.coerce.number().min(0).max(50).nullable().optional(),
            notes: z.string().max(500).nullable().optional(),
            sets: z
              .array(z.object({ setNumber: z.coerce.number().int().min(1), reps: z.coerce.number().int().min(0).max(200) }))
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
      description:
        'Marks the workout as finished (records its end time). An already finished workout is returned unchanged. A workout nobody finishes closes itself 1.5 hours after its last change (autoFinished: true).',
      inputSchema: { workoutId: id },
    },
    async ({ workoutId }) => apiResult(() => api.post(`/workouts/${workoutId}/finish`)),
  );
}
