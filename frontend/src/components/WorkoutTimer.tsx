import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useActiveWorkoutQuery, useSetWorkoutPausedMutation } from '../shared/api/workouts/index.js';
import type { ActiveWorkout } from '../types/index.js';

// Time on the clock: since the start, minus every pause (the closed ones in
// pausedMs and the one in progress) - the same rule the server uses for the
// workout's duration.
function elapsedMs(w: ActiveWorkout, now: number): number {
  const paused = w.pausedMs + (w.pausedAt ? now - new Date(w.pausedAt).getTime() : 0);
  return Math.max(0, now - new Date(w.timeStart).getTime() - paused);
}

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  const mmss = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

// Header stopwatch for the open workout (design "B · Секундомір з паузою"):
// the time opens the workout, the square button pauses/resumes it. Renders
// nothing without an open workout.
export default function WorkoutTimer() {
  const { t } = useTranslation();
  const { data: workout } = useActiveWorkoutQuery();
  const setPaused = useSetWorkoutPausedMutation();
  const [now, setNow] = useState(() => Date.now());
  const paused = !!workout?.pausedAt;

  // Ticks only while running - a paused clock doesn't change.
  useEffect(() => {
    if (!workout || paused) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [workout, paused]);

  if (!workout) return null;
  const time = formatClock(elapsedMs(workout, paused ? new Date(workout.pausedAt!).getTime() : now));

  return (
    <div className="flex h-11 items-stretch rounded-xl border border-surface-border bg-surface-raised">
      <Link
        to={`/workouts/${workout.id}`}
        aria-label={t('nav.timer.open', { time })}
        className="flex items-center gap-2 rounded-l-xl pl-3 pr-2 hover:bg-white/5"
      >
        <svg
          className={`h-[18px] w-[18px] ${paused ? 'text-slate-400' : 'text-accent'}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2M9.5 2.5h5" />
        </svg>
        <span className={`text-[17px] font-bold tabular-nums ${paused ? 'text-slate-400' : 'text-white'}`}>
          {time}
        </span>
        {paused && <span className="sr-only">{t('nav.timer.paused')}</span>}
      </Link>
      <button
        type="button"
        onClick={() => setPaused.mutate({ id: workout.id, paused: !paused })}
        disabled={setPaused.isPending}
        aria-label={paused ? t('nav.timer.resume') : t('nav.timer.pause')}
        aria-pressed={paused}
        className="flex items-center rounded-r-xl pl-0.5 pr-1.5 disabled:opacity-60"
      >
        <span
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg ${
            paused ? 'bg-accent' : 'bg-accent/20'
          }`}
        >
          {paused ? (
            <svg className="h-3.5 w-3.5 text-surface" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 4.5v15l13-7.5z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5 text-accent-hover" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="4.5" width="4" height="15" rx="1" />
              <rect x="14" y="4.5" width="4" height="15" rx="1" />
            </svg>
          )}
        </span>
      </button>
    </div>
  );
}
