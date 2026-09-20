import type { TFunction } from 'i18next';

// Backend error responses carry a stable machine `error` code (see every
// `reply.code(4xx).send({ error: '...' })` in backend/src/modules) - that
// code is what gets translated, never the accompanying `message`, which is
// server-side prose in a fixed language and would leak through untranslated
// on a mismatched UI language.
export function translateApiError(err: unknown, t: TFunction, fallbackKey = 'errors.generic'): string {
  const data = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  const code = data?.error;
  if (code) {
    // `import_failed` embeds a dynamic parser detail that can't be
    // enumerated ahead of time - interpolate it into the translated
    // template instead of discarding it.
    return t(`errors.${code}`, { detail: data?.message, defaultValue: t(fallbackKey) });
  }
  return t(fallbackKey);
}
