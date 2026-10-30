// Padlock for "sets are fixed by the program" (workout card, program page).
export default function LockIcon({ open = false, size = 18, className }: { open?: boolean; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={['shrink-0', className].filter(Boolean).join(' ')}
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d={open ? 'M8 11V7a4 4 0 0 1 7.6-1.8' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
    </svg>
  );
}
