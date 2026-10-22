// Fetching a client's favicon for the Integrations page lives here, so tests
// can vi.mock this one module instead of the network (like cimd.client.ts).

export type ClientIcon = {
  contentType: string;
  body: Buffer;
};

const FETCH_TIMEOUT_MS = 5_000;
const MAX_ICON_BYTES = 100 * 1024;

// Raster images only. We serve the bytes from our own origin, and an SVG
// opened there directly would run its scripts in MyGym's origin.
const RASTER_TYPES = new Set([
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/png',
  'image/gif',
  'image/webp',
  'image/jpeg',
]);

// `host` must already be an allow-listed client host (parseClientIdUrl) -
// that is what keeps this request away from internal addresses.
export async function fetchFavicon(host: string): Promise<ClientIcon | null> {
  let res: Response;
  try {
    res = await fetch(`https://${host}/favicon.ico`, {
      headers: { accept: 'image/*' },
      redirect: 'manual', // a redirect could leave the allow-listed host
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  const contentType = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (res.status !== 200 || !RASTER_TYPES.has(contentType)) {
    await res.body?.cancel();
    return null;
  }
  if (Number(res.headers.get('content-length') ?? 0) > MAX_ICON_BYTES) {
    await res.body?.cancel();
    return null;
  }
  const body = await readCapped(res);
  if (!body || body.length === 0) return null;
  return { contentType, body };
}

// Reads at most MAX_ICON_BYTES, also without a Content-Length; a body that
// is too big, cut off or slower than the timeout is just "no icon".
async function readCapped(res: Response): Promise<Buffer | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_ICON_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks);
}
