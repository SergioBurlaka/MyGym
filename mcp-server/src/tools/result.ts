import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError } from '../apiClient.js';

// Every tool returns the MyGym API's JSON unchanged - Claude decides how to
// present it. Failures become tool errors (isError) with a message Claude
// can act on, never an exception that would take the request down.
export async function apiResult(call: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await call();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: describeError(err) }] };
  }
}

function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Could not reach the MyGym API. Try again in a moment.';
  }
  const body = err.body as { error?: string; issues?: unknown } | null;
  switch (err.status) {
    case 401:
      return 'MyGym rejected the access token: it is invalid or was revoked. Create a new token in MyGym → Integrations and update this connector.';
    case 404:
      return 'Not found in this MyGym account (wrong id, or it was deleted). List the items first to get valid ids.';
    case 400:
      return `MyGym rejected the input (${body?.error ?? 'validation_error'}): ${JSON.stringify(body?.issues ?? body)}`;
    case 429:
      return 'Too many requests to MyGym. Wait a minute and try again.';
    default:
      if (err.status >= 500) return 'MyGym server error. Try again later.';
      return `MyGym answered ${err.status}: ${JSON.stringify(body)}`;
  }
}
