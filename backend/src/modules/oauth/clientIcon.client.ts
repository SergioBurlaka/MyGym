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
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length === 0 || body.length > MAX_ICON_BYTES) return null;
  return { contentType, body };
}
