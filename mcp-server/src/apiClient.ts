// A tiny client for the MyGym REST API, bound to ONE caller's Authorization
// header. A new one is created for every MCP request, so a tool can only
// ever act with the token of the request it is serving.

const API_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`MyGym API answered ${status}`);
  }
}

export function createApiClient(baseUrl: string, authorization: string) {
  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // A hung backend becomes a tool error ("could not reach") instead of
      // a request held open until nginx's 300 s proxy timeout.
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  return {
    get: (path: string) => request('GET', path),
    post: (path: string, body: unknown = {}) => request('POST', path, body),
    put: (path: string, body: unknown) => request('PUT', path, body),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
