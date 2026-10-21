import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './apiClient.js';

// Called anew for every HTTP request with that request's own apiClient -
// tools registered here can never see another user's token.
export function createMcpServer(_api: ApiClient): McpServer {
  const server = new McpServer({ name: 'mygym', version: '1.0.0' });
  return server;
}
