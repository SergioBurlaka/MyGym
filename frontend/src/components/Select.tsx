import { useEffect, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string };

export default function Select({
  value,
  onChange,
  options,
  placeholder = 'Оберіть…',
  disabled,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  function pick(v: string) {
    setOpen(false);
    onChange(v);
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="input flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={`truncate whitespace-nowrap ${selected ? 'text-slate-100' : 'text-slate-500'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </button>

      {/* Always mounted (not conditionally rendered) so grid-template-rows
          can transition both open AND closed - `display:none` on mount/
          unmount would skip the animation entirely. */}
      <div
        className={`absolute left-0 right-0 z-20 mt-2 grid overflow-hidden rounded-lg border border-surface-border bg-surface-raised shadow-xl transition-all duration-200 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-64 overflow-auto p-1">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">Немає доступних варіантів</p>
            ) : (
              options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pick(o.value)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-border ${
                    o.value === value ? 'text-accent' : 'text-slate-200'
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
