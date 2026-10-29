import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  addMonths,
  monthGrid,
  monthOf,
  parseIso,
  shiftMonthKeepDay,
  startOfWeekMonday,
  todayIso,
  weekdayMonday,
  type MonthRef,
} from '../utils/date.js';

// The workout date picker (task docs/tasks/date-picker.md, design artboard 6
// "after Ant Design"): a popover calendar instead of the native date input,
// which opened Android's white system dialog. Any date - past or future.
// Picking a day applies it at once (no OK button: a workout always has a
// date); Esc / a tap outside closes without a change.

type View = 'date' | 'month' | 'year';
// Which way the grid animates in: from the right / left (paging), or a zoom
// (switching day / month / year view).
type Motion = 'right' | 'left' | 'panel' | null;

const CLOSE_AFTER_PICK_MS = 180; // long enough to see the picked day "pop"
const CLOSE_FALLBACK_MS = 300; // the close animation is 160 ms
const POPOVER_MAX_WIDTH = 360;
const GAP_PX = 8;
// Paging stops here - "any date" within a sane range (a 2-digit year would
// also turn into 19xx in the Date constructor).
const MIN_YEAR = 1900;
const MAX_YEAR = 2099;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function useDateFormats() {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith('uk') ? 'uk-UA' : 'en-US';
  return useMemo(() => {
    const dayMonthYear = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    const full = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const monthLong = new Intl.DateTimeFormat(locale, { month: 'long' });
    const monthShort = new Intl.DateTimeFormat(locale, { month: 'short' });
    return {
      // "29 жовт. 2026, чт" / "29 Oct 2026, Thu" - from parts, so no "р." suffix.
      trigger(iso: string) {
        const date = parseIso(iso);
        const parts = dayMonthYear.formatToParts(date);
        const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
        return `${part('day')} ${part('month')} ${part('year')}, ${weekdayShort.format(date)}`;
      },
      // "29 жовтня 2026" - from parts, without uk's trailing "р." (it read
      // as "р.. Змінити" in the trigger's label).
      full(iso: string) {
        const parts = full.formatToParts(parseIso(iso));
        const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
        return locale === 'en-US' ? `${part('month')} ${part('day')}, ${part('year')}` : `${part('day')} ${part('month')} ${part('year')}`;
      },
      weekdayLong: (iso: string) => weekdayLong.format(parseIso(iso)),
      monthTitle: ({ year, month }: MonthRef) => capitalize(monthLong.format(new Date(year, month, 1))),
      monthShort: (month: number) => monthShort.format(new Date(2026, month, 1)),
      monthLong: (month: number) => capitalize(monthLong.format(new Date(2026, month, 1))),
      // Mon..Sun headers: 5 Jan 2026 is a Monday.
      weekdayHeaders: Array.from({ length: 7 }, (_, i) => {
        const date = new Date(2026, 0, 5 + i);
        return { short: capitalize(weekdayShort.format(date)), long: weekdayLong.format(date) };
      }),
    };
  }, [locale]);
}

export default function DatePicker({
  value,
  onChange,
  ariaLabel,
  markedDates,
  onVisibleRangeChange,
}: {
  value: string; // 'YYYY-MM-DD'
  onChange: (iso: string) => void;
  ariaLabel: string;
  // Days with a workout - a dot under the number.
  markedDates?: Set<string>;
  // The 6 weeks on screen, so the caller can load the dots for them.
  onVisibleRangeChange?: (from: string, to: string) => void;
}) {
  const { t } = useTranslation();
  const fmt = useDateFormats();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<View>('date');
  const [shown, setShown] = useState<MonthRef>(() => monthOf(value));
  const [focused, setFocused] = useState(value);
  const [motion, setMotion] = useState<{ kind: Motion; tick: number }>({ kind: null, tick: 0 });
  const [popped, setPopped] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusDayRef = useRef(false);
  // Switching views unmounts the button that was pressed - focus moves to
  // the year title (there in every view) so Esc and the Tab trap keep working.
  const focusYearTitleRef = useRef(false);
  const yearTitleRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeFallbackRef = useRef<ReturnType<typeof setTimeout>>();
  // Whether it's open right now, for finishClose run from a timer or an
  // event (their closures may hold a stale `open`).
  const openRef = useRef(false);
  const today = todayIso();

  const grid = useMemo(() => monthGrid(shown), [shown]);
  // Only while open: the dots aren't needed (or fetched) until then.
  useEffect(() => {
    if (open) onVisibleRangeChange?.(grid[0], grid[grid.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid[0], open]);

  // Keyboard focus lives in the shown month: after paging with the buttons
  // or picking a month / year, the same day there (31 -> 30...) - else no
  // day would be reachable with Tab.
  useEffect(() => {
    const f = monthOf(focused);
    const diff = shown.year * 12 + shown.month - (f.year * 12 + f.month);
    if (diff !== 0) setFocused(shiftMonthKeepDay(focused, diff));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // Nothing behind the dialog scrolls while it's open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(
    () => () => {
      clearTimeout(closeTimerRef.current);
      clearTimeout(closeFallbackRef.current);
    },
    [],
  );

  function animate(kind: Motion) {
    setMotion((m) => ({ kind, tick: m.tick + 1 }));
  }

  function openPicker() {
    clearTimeout(closeTimerRef.current);
    clearTimeout(closeFallbackRef.current);
    openRef.current = true;
    setShown(monthOf(value));
    setFocused(value);
    setView('date');
    setMotion({ kind: null, tick: 0 });
    setClosing(false);
    setOpen(true);
    focusDayRef.current = true;
  }

  function finishClose() {
    clearTimeout(closeFallbackRef.current);
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    setClosing(false);
    triggerRef.current?.focus();
  }

  function closePicker() {
    if (!open || closing) return;
    clearTimeout(closeTimerRef.current);
    // No exit animation to wait for - animationend would never come.
    if (reducedMotion()) {
      finishClose();
      return;
    }
    setClosing(true);
    // animationend ends the close; this only backs it up - a backgrounded
    // tab throttles animations and the event may come late or never.
    closeFallbackRef.current = setTimeout(finishClose, CLOSE_FALLBACK_MS);
  }

  function pick(iso: string) {
    if (iso !== value) onChange(iso);
    setFocused(iso);
    const month = monthOf(iso);
    if (month.year !== shown.year || month.month !== shown.month) {
      animate(iso < grid[0] ? 'left' : 'right');
      setShown(month);
    }
    setPopped((n) => n + 1);
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(closePicker, CLOSE_AFTER_PICK_MS);
  }

  // Under the trigger, as wide as the content allows (16px page gutters).
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(window.innerWidth - 32, POPOVER_MAX_WIDTH);
      const left = Math.min(Math.max(16, rect.left), window.innerWidth - 16 - width);
      const top = rect.bottom + GAP_PX;
      // A short screen (landscape phone): scroll inside, not off the edge.
      setPosition({ top, left, width, maxHeight: window.innerHeight - top - 16 });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Keyboard focus follows `focused` in the day grid (on open, and when
  // arrows move it) - not on every render, so a mouse user's focus stays put.
  useEffect(() => {
    if (open && focusYearTitleRef.current && yearTitleRef.current) {
      focusYearTitleRef.current = false;
      yearTitleRef.current.focus();
    }
    if (!open || view !== 'date' || !focusDayRef.current) return;
    // The dialog mounts a render after `open` (once it's positioned) - keep
    // the request until the day is there.
    const day = dialogRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focused}"]`);
    if (!day) return;
    focusDayRef.current = false;
    day.focus();
  });

  function moveFocus(iso: string) {
    const month = monthOf(iso);
    if (month.year !== shown.year || month.month !== shown.month) {
      animate(iso < focused ? 'left' : 'right');
      setShown(month);
    }
    setFocused(iso);
    focusDayRef.current = true;
  }

  function onDayKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => startOfWeekMonday(focused),
      End: () => addDays(startOfWeekMonday(focused), 6),
      PageUp: () => shiftMonthKeepDay(focused, e.shiftKey ? -12 : -1),
      PageDown: () => shiftMonthKeepDay(focused, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    moveFocus(move());
  }

  // Esc - on the document while open, not the dialog: when a re-keyed grid
  // drops the focused day, focus falls to <body> and the dialog hears nothing.
  const closeRef = useRef(closePicker);
  closeRef.current = closePicker;
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Tab stays inside the dialog.
  function onDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])')];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function page(direction: 1 | -1, unit: 'month' | 'year') {
    const step = unit === 'month' ? 1 : view === 'year' ? 120 : 12;
    const next = addMonths(shown, direction * step);
    if (next.year < MIN_YEAR || next.year > MAX_YEAR) return;
    // The grid re-mounts: a focused day would vanish - follow it instead.
    if ((document.activeElement as HTMLElement | null)?.dataset?.iso) focusDayRef.current = true;
    setFocused((f) => shiftMonthKeepDay(f, direction * step));
    setShown(next);
    animate(direction > 0 ? 'right' : 'left');
  }

  function switchView(next: View) {
    setView(next);
    animate('panel');
    if (next === 'date') focusDayRef.current = true;
    else focusYearTitleRef.current = true;
  }

  const decade = Math.floor(shown.year / 10) * 10;
  const visible = open || closing;
  const gridMotion =
    motion.kind === 'right'
      ? 'animate-dp-from-right'
      : motion.kind === 'left'
        ? 'animate-dp-from-left'
        : motion.kind === 'panel'
          ? 'animate-dp-panel'
          : '';
  const navButton =
    'flex h-11 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-surface-border hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
  const titleButton =
    'h-11 rounded-lg px-1.5 text-base font-bold text-slate-100 hover:bg-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

  const triggerLabel = fmt.trigger(value);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`relative flex h-11 items-center gap-2 rounded-lg border bg-surface-raised px-3 text-base font-semibold text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          open && !closing ? 'z-50 border-accent' : 'border-surface-border'
        }`}
        aria-haspopup="dialog"
        aria-expanded={open && !closing}
        aria-label={t('datePicker.triggerAria', { label: ariaLabel, date: fmt.full(value) })}
        onClick={() => (open && !closing ? closePicker() : openPicker())}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-accent-hover" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </svg>
        <span className="tabular-nums">{triggerLabel}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-slate-400 transition-transform duration-200 motion-reduce:transition-none ${open && !closing ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {visible &&
        position &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 z-40 bg-black/60 motion-reduce:animate-none ${closing ? 'animate-dp-fade-out' : 'animate-dp-fade-in'}`}
              // click, not mousedown: with no close animation (reduced motion)
              // the backdrop would be gone before the tap's click, which
              // would land on whatever is underneath.
              onClick={closePicker}
              aria-hidden="true"
            />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={t('datePicker.dialog')}
              onKeyDown={onDialogKeyDown}
              onAnimationEnd={(e) => {
                if (closing && e.target === e.currentTarget) finishClose();
              }}
              style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
              className={`fixed z-50 flex origin-top flex-col overflow-y-auto rounded-xl border border-surface-border bg-surface-raised px-3 pb-3 pt-2 shadow-2xl motion-reduce:animate-none ${
                closing ? 'animate-dp-slide-out' : 'animate-dp-slide-in'
              }`}
            >
              <div className="-mx-1 mb-1.5 flex h-12 items-center gap-0.5 border-b border-surface-border">
                <button
                  type="button"
                  className={navButton}
                  aria-label={t(view === 'year' ? 'datePicker.prevDecade' : 'datePicker.prevYear')}
                  onClick={() => page(-1, 'year')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 6l-6 6 6 6M18 6l-6 6 6 6" />
                  </svg>
                </button>
                {view === 'date' && (
                  <button type="button" className={navButton} aria-label={t('datePicker.prevMonth')} onClick={() => page(-1, 'month')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 6l-6 6 6 6" />
                    </svg>
                  </button>
                )}
                <div className="flex flex-1 items-center justify-center gap-0.5" aria-live="polite">
                  {view === 'date' && (
                    <button type="button" className={titleButton} aria-label={t('datePicker.chooseMonth')} onClick={() => switchView('month')}>
                      {fmt.monthTitle(shown)}
                    </button>
                  )}
                  <button
                    ref={yearTitleRef}
                    type="button"
                    className={`${titleButton} tabular-nums`}
                    aria-label={t('datePicker.chooseYear')}
                    onClick={() => switchView(view === 'year' ? 'month' : 'year')}
                  >
                    {view === 'year' ? `${decade}–${decade + 9}` : shown.year}
                  </button>
                </div>
                {view === 'date' && (
                  <button type="button" className={navButton} aria-label={t('datePicker.nextMonth')} onClick={() => page(1, 'month')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className={navButton}
                  aria-label={t(view === 'year' ? 'datePicker.nextDecade' : 'datePicker.nextYear')}
                  onClick={() => page(1, 'year')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 6l6 6-6 6M12 6l6 6-6 6" />
                  </svg>
                </button>
              </div>

              <div className="min-h-72">
                {/* Keyed, so paging / switching views replays the animation. */}
                <div key={`${view}-${shown.year}-${shown.month}-${motion.tick}`} className={`motion-reduce:animate-none ${gridMotion}`}>
                  {view === 'date' ? (
                    <>
                      <div className="grid h-8 grid-cols-7 items-center">
                        {fmt.weekdayHeaders.map((w, i) => (
                          <abbr
                            key={w.long}
                            title={w.long}
                            className={`text-center text-xs font-semibold no-underline ${i > 4 ? 'text-hint' : 'text-slate-400'}`}
                          >
                            {w.short}
                          </abbr>
                        ))}
                      </div>
                      <div className="grid grid-cols-7" onKeyDown={onDayKeyDown}>
                        {grid.map((iso) => {
                          const inMonth = monthOf(iso).month === shown.month;
                          const selected = iso === value;
                          const isToday = iso === today;
                          const marked = markedDates?.has(iso) ?? false;
                          const weekend = weekdayMonday(iso) > 4;
                          const label = [
                            `${fmt.full(iso)}, ${fmt.weekdayLong(iso)}`,
                            isToday ? t('datePicker.todaySuffix') : '',
                            marked ? t('datePicker.workoutSuffix') : '',
                          ].join('');
                          return (
                            <button
                              key={iso}
                              type="button"
                              data-iso={iso}
                              tabIndex={iso === focused ? 0 : -1}
                              aria-label={label}
                              aria-pressed={selected}
                              aria-current={isToday ? 'date' : undefined}
                              className="flex h-11 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                              onClick={() => pick(iso)}
                            >
                              <span
                                key={selected ? `sel-${popped}` : 'cell'}
                                className={`relative flex h-10 w-10 items-center justify-center rounded-lg border text-base tabular-nums transition-colors ${
                                  selected
                                    ? `border-transparent bg-accent font-extrabold text-surface ${popped > 0 ? 'animate-dp-pop motion-reduce:animate-none' : ''}`
                                    : `${isToday ? 'border-accent font-extrabold' : 'border-transparent'} ${
                                        inMonth ? (weekend ? 'font-semibold text-slate-300' : 'font-semibold text-slate-100') : 'font-medium text-hint'
                                      } hover:bg-surface-border`
                                }`}
                              >
                                {Number(iso.slice(8))}
                                {marked && (
                                  <span
                                    className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${selected ? 'bg-surface' : 'bg-accent'}`}
                                    aria-hidden="true"
                                  />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-3 gap-x-2 gap-y-3 px-1 py-4">
                      {(view === 'month'
                        ? Array.from({ length: 12 }, (_, m) => ({
                            key: m,
                            label: fmt.monthShort(m),
                            aria: `${fmt.monthLong(m)} ${shown.year}`,
                            selected: monthOf(value).year === shown.year && monthOf(value).month === m,
                            current: monthOf(today).year === shown.year && monthOf(today).month === m,
                            outside: false,
                            disabled: false,
                            onPick: () => {
                              setShown({ year: shown.year, month: m });
                              switchView('date');
                            },
                          }))
                        : Array.from({ length: 12 }, (_, i) => {
                            const year = decade - 1 + i;
                            return {
                              key: year,
                              label: String(year),
                              aria: t('datePicker.yearAria', { year }),
                              selected: monthOf(value).year === year,
                              current: monthOf(today).year === year,
                              outside: year < decade || year > decade + 9,
                              disabled: year < MIN_YEAR || year > MAX_YEAR,
                              onPick: () => {
                                setShown({ year, month: shown.month });
                                switchView('month');
                              },
                            };
                          })
                      ).map((cell) => (
                        <button
                          key={cell.key}
                          type="button"
                          aria-label={cell.aria}
                          aria-pressed={cell.selected}
                          disabled={cell.disabled}
                          className="flex h-14 items-center justify-center rounded-xl disabled:invisible focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          onClick={cell.onPick}
                        >
                          <span
                            className={`flex h-10 w-full max-w-20 items-center justify-center rounded-lg border px-2.5 text-base tabular-nums ${
                              cell.selected
                                ? 'border-transparent bg-accent font-extrabold text-surface'
                                : `${cell.current ? 'border-accent' : 'border-transparent'} font-semibold ${
                                    cell.outside ? 'text-hint' : 'text-slate-100'
                                  } hover:bg-surface-border`
                            }`}
                          >
                            {cell.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="-mx-1 mt-1.5 flex items-center gap-2 border-t border-surface-border px-1 pt-2.5">
                <button
                  type="button"
                  className="h-11 rounded-lg border border-accent-muted bg-accent/10 px-3 text-sm font-bold text-accent-hover hover:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => pick(today)}
                >
                  {t('datePicker.today')}
                </button>
                <button
                  type="button"
                  className="h-11 rounded-lg border border-surface-border px-3 text-sm font-semibold text-slate-100 hover:bg-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => pick(addDays(today, -1))}
                >
                  {t('datePicker.yesterday')}
                </button>
                <span className="flex-1" />
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                  {t('datePicker.hasWorkout')}
                </span>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
