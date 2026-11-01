// First letter of each of the first two dot/underscore/dash/digit-separated
// segments of the email's local part (e.g. "j.connor@..." -> "JC") - falls
// back to the first two letters when there's only one segment.
export function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const segments = local.split(/[^a-zA-Z]+/).filter(Boolean);
  if (segments.length >= 2) return (segments[0][0] + segments[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}
