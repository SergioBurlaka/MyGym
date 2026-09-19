import { useEffect, useRef, useState } from 'react';
import type { Program, WorkoutTemplate } from '../types/index.js';
import { formatDateUk } from '../utils/weight.js';

const CLOSE_ANIMATION_MS = 120;

type MenuEntry =
  | { kind: 'program'; label: string; programId: string; exerciseNames: string[] }
  | { kind: 'template'; label: string; workoutId: string; date: string; exerciseNames: string[] };

export default function NewWorkoutButton({
  programs,
  templates,
  busy,
  onStart,
}: {
  programs: Program[];
  templates: WorkoutTemplate[];
  busy?: boolean;
  onStart: (opts: { programLabel?: string; copyFromWorkoutId?: string; programId?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Programs are the authoritative, explicitly-authored version of a named
  // routine. Historical "last workout tagged X" templates only fill in for
  // labels that don't have a saved Program yet (old data from before
  // Programs existed).
  const programNames = new Set(programs.map((p) => p.name));
  const entries: MenuEntry[] = [
    ...programs.map((p): MenuEntry => ({
      kind: 'program',
      label: p.name,
      programId: p.id,
      exerciseNames: p.programExercises.map((pe) => pe.exercise.name),
    })),
    ...templates
      .filter((t) => !programNames.has(t.label))
      .map((t): MenuEntry => ({
        kind: 'template',
        label: t.label,
        workoutId: t.workoutId,
        date: t.date,
        exerciseNames: t.exerciseNames,
      })),
  ];

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
    if (entries.length === 0) {
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

  function pick(opts: { programLabel?: string; copyFromWorkoutId?: string; programId?: string }) {
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
          {entries.map((entry) => (
            <button
              key={`${entry.kind}-${entry.label}`}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-surface-border"
              onClick={() =>
                pick(
                  entry.kind === 'program'
                    ? { programId: entry.programId }
                    : { programLabel: entry.label, copyFromWorkoutId: entry.workoutId },
                )
              }
            >
              <span>
                <span className="font-medium text-accent">
                  {entry.kind === 'program' ? `Програма «${entry.label}»` : `З «${entry.label}»`}
                </span>{' '}
                {entry.kind === 'template' && <span className="text-slate-500">({formatDateUk(entry.date)})</span>}
              </span>
              <div className="mt-0.5 truncate text-xs text-slate-400">{entry.exerciseNames.join(', ')}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
