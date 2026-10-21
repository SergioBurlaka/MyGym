import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
    // How the request authenticated: a browser session (JWT access token)
    // or a personal access token used by a program (MCP server, Claude Code).
    authMethod: 'session' | 'pat';
  }
}
