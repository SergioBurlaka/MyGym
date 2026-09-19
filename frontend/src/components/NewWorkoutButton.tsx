import { useEffect, useRef, useState } from 'react';
import type { WorkoutTemplate } from '../types/index.js';
import { formatDateUk } from '../utils/weight.js';

const CLOSE_ANIMATION_MS = 120;

export default function NewWorkoutButton({
  templates,
  busy,
  onStart,
}: {
  templates: WorkoutTemplate[];
  busy?: boolean;
  onStart: (opts: { programLabel?: string; copyFromWorkoutId?: string }) => void;
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
    // Nothing to choose from yet - skip the menu entirely.
    if (templates.length === 0) {
      onStart({});
      return;
    }
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
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, closing]);

  useEffect(() => () => clearTimeout(closeTimeout.current), []);

  function pick(opts: { programLabel?: string; copyFromWorkoutId?: string }) {
    close();
    onStart(opts);
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button className="btn-primary" onClick={toggle} disabled={busy}>
        {busy ? 'Створюємо…' : '+ Нове тренування'}
      </button>

      {open && (
        <div
          className={`absolute right-0 z-20 mt-2 w-72 origin-top-right rounded-lg border border-surface-border bg-surface-raised p-2 shadow-xl ${
            closing ? 'animate-pop-out' : 'animate-pop-in'
          }`}
        >
          <button
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-surface-border"
            onClick={() => pick({})}
          >
            Порожнє тренування
          </button>
          {templates.map((t) => (
            <button
              key={t.label}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-surface-border"
              onClick={() => pick({ programLabel: t.label, copyFromWorkoutId: t.workoutId })}
            >
              <span>
                <span className="font-medium text-accent">З «{t.label}»</span>{' '}
                <span className="text-slate-500">({formatDateUk(t.date)})</span>
              </span>
              <div className="mt-0.5 truncate text-xs text-slate-400">{t.exerciseNames.join(', ')}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
