import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../apiClient.js';
import { apiResult } from './result.js';

export function registerProgressionTools(server: McpServer, api: ApiClient) {
  server.registerTool(
    'get_progression_overview',
    {
      title: 'Progression overview',
      description:
        'For every exercise: last weight, max reps, sessions since progress (vs tryMoreAfterWorkouts) and a suggestion (increase_weight, start_adding_weight, try_more, ok, no_data) - use for "what should I increase" questions.',
      annotations: { readOnlyHint: true },
    },
    async () => apiResult(() => api.get('/progression')),
  );

  server.registerTool(
    'get_exercise_history',
    {
      title: 'Exercise history',
      description:
        'History of one exercise by date: weight, max/avg reps, volume, estimated 1RM (Epley) and personal-record flags - use for "how did my squat progress" questions.',
      inputSchema: { exerciseId: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ exerciseId }) => apiResult(() => api.get(`/progression/${exerciseId}/history`)),
  );
}
