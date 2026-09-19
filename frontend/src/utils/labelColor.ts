// Deterministic colour per workout `programLabel`, so any label (not just
// "А"/"Б") gets a consistent, distinct colour across the app.
const PALETTE = [
  { border: 'border-l-sky-500', badgeBg: 'bg-sky-500/10', badgeText: 'text-sky-400' },
  { border: 'border-l-amber-500', badgeBg: 'bg-amber-500/10', badgeText: 'text-amber-400' },
  { border: 'border-l-violet-500', badgeBg: 'bg-violet-500/10', badgeText: 'text-violet-400' },
  { border: 'border-l-emerald-500', badgeBg: 'bg-emerald-500/10', badgeText: 'text-emerald-400' },
  { border: 'border-l-rose-500', badgeBg: 'bg-rose-500/10', badgeText: 'text-rose-400' },
  { border: 'border-l-cyan-500', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
];

export function labelColor(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
