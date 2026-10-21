import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './apiClient.js';
import { registerExerciseTools } from './tools/exercises.js';
import { registerWorkoutTools } from './tools/workouts.js';
import { registerProgramTools } from './tools/programs.js';
import { registerProgressionTools } from './tools/progression.js';

// Called anew for every HTTP request with that request's own apiClient -
// tools registered here can never see another user's token.
export function createMcpServer(api: ApiClient): McpServer {
  const server = new McpServer({ name: 'mygym', version: '1.0.0' });
  registerExerciseTools(server, api);
  registerWorkoutTools(server, api);
  registerProgramTools(server, api);
  registerProgressionTools(server, api);
  return server;
}
