// "Where to go after login" from a query string - only a path on our own
// origin. Browsers read "//evil.example" and "/\evil.example" as another
// host, and drop tabs/newlines before parsing ("/\t/evil.example" becomes
// "//evil.example"), so control characters, spaces and backslashes are
// refused outright and the URL parser has the final say on the origin.
const BASE = 'http://next.invalid';

export function safeNext(next: unknown): string | null {
  if (typeof next !== 'string' || next.length > 2000) return null;
  if (!next.startsWith('/') || /[\u0000- \u007f\\]/.test(next)) return null;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  return url.pathname + url.search + url.hash;
}
