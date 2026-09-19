import { useEffect, useRef, useState } from 'react';

const CLOSE_ANIMATION_MS = 120;

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
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout>>();

  function close() {
    setClosing(true);
    clearTimeout(closeTimeout.current);
    closeTimeout.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_ANIMATION_MS);
  }

  function toggle() {
    if (disabled) return;
    if (open) {
      close();
      return;
    }
    clearTimeout(closeTimeout.current);
    setClosing(false);
    setOpen(true);
  }

  useEffect(() => {
    if (!open || closing) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open, closing]);

  useEffect(() => () => clearTimeout(closeTimeout.current), []);

  const selected = options.find((o) => o.value === value);

  function pick(v: string) {
    close();
    onChange(v);
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className="input flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={selected ? 'text-slate-100' : 'text-slate-500'}>
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

      {open && (
        <div
          className={`absolute left-0 right-0 z-20 mt-2 max-h-64 origin-top overflow-auto rounded-lg border border-surface-border bg-surface-raised p-1 shadow-xl ${
            closing ? 'animate-pop-out' : 'animate-pop-in'
          }`}
        >
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
      )}
    </div>
  );
}
