import { useEffect, useReducer, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useActiveWorkoutQuery, useSetWorkoutPausedMutation } from '../shared/api/workouts/index.js';
import type { ActiveWorkout } from '../types/index.js';
import { translateApiError } from '../utils/apiError.js';

// Time on the clock at server time `now`: since the start, minus every pause
// (the closed ones in pausedMs and the one in progress) - the same rule the
// server uses for the workout's duration.
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
  const { data } = useActiveWorkoutQuery();
  const setPaused = useSetWorkoutPausedMutation();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState<string | null>(null);
  const workout = data?.workout ?? null;
  const paused = !!workout?.pausedAt;

  // Re-renders every second while running; the time itself is read during
  // render, so the first frame after a resume is already right.
  useEffect(() => {
    if (!workout || paused) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [workout, paused]);

  // The failure note goes away by itself - the next tap retries anyway.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  if (!workout) return null;
  const now = paused ? new Date(workout.pausedAt!).getTime() : Date.now() + (data?.clockOffsetMs ?? 0);
  const time = formatClock(elapsedMs(workout, now));

  function toggle() {
    setError(null);
    setPaused.mutate(
      { id: workout!.id, paused: !paused },
      { onError: (err) => setError(translateApiError(err, t, 'nav.timer.error')) },
    );
  }

  return (
    <div className="relative">
      <div className="flex h-11 items-stretch rounded-xl border border-surface-border bg-surface-raised">
        <Link
          to={`/workouts/${workout.id}`}
          aria-label={t(paused ? 'nav.timer.openPaused' : 'nav.timer.open', { time })}
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
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={setPaused.isPending}
          aria-label={paused ? t('nav.timer.resume') : t('nav.timer.pause')}
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
      <div role="alert" className="absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2">
        {error && (
          <p className="w-56 animate-pop-in rounded-lg border border-surface-border bg-surface-raised p-2 text-center text-xs text-red-400 shadow-xl">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
