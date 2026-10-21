// "Where to go after login" from a query string - only a path on our own
// origin. "//evil.example" or "/\evil.example" would be read by browsers as
// another host (open redirect), so anything but "/<not / or \>" is dropped.
export function safeNext(next: unknown): string | null {
  if (typeof next !== 'string' || next.length > 2000) return null;
  if (!next.startsWith('/') || next[1] === '/' || next[1] === '\\') return null;
  return next;
}
