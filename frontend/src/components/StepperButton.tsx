// The "−" / "+" of a stepper: 44x44, the label says what a tap does.
export default function StepperButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: 'decrease' | 'increase';
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-surface-border text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      disabled={disabled}
      onClick={onClick}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d={direction === 'increase' ? 'M12 5v14M5 12h14' : 'M5 12h14'} />
      </svg>
    </button>
  );
}
