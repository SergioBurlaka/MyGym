import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useScheduleHistoryQuery } from '../shared/api/settings/index.js';
import { useWorkoutDatesQuery } from '../shared/api/workouts/index.js';
import { formatDate } from '../utils/weight.js';
import { addDays, startOfWeekMonday, todayIso, weekdayMonday } from '../utils/date.js';
import { calendarWeeks, historyStart, monthLabels } from '../utils/consistencyCalendar.js';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// The whole history in one request: the dates endpoint is light (~150 bytes a
// workout, ~24 KB for a year of 3 a week), so no paging while scrolling.
const HISTORY_FROM = '1970-01-01';

type DayState = 'trained_planned' | 'trained_extra' | 'missed_planned' | 'rest';

const STATE_COLOR: Record<DayState, string> = {
  trained_planned: 'bg-good',
  trained_extra: 'bg-sky-500',
  missed_planned: 'bg-red-500',
  rest: 'bg-surface-border',
};
// Days before the history starts and later this week: no status at all.
const MUTED_COLOR = 'bg-[#1f242d]';

// ISO weekday: 1 = Monday ... 7 = Sunday, as users.trainingDays stores it.
function isoWeekday(dateStr: string): number {
  return weekdayMonday(dateStr) + 1;
}

type Tip = { date: string; missed: boolean; rect: DOMRect };

export default function ConsistencyCalendar() {
  const { t, i18n } = useTranslation();
  const historyQuery = useScheduleHistoryQuery();
  // Oldest-first list of {trainingDays, effectiveFrom} - the schedule
  // effective on a given date is the last entry whose effectiveFrom is not
  // after that date, so each past date is judged by the schedule that was
  // actually in effect then, not by whatever the schedule is today.
  const history = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);

  // Local, not UTC: after midnight in Kyiv toISOString() still said yesterday.
  const todayStr = useMemo(() => todayIso(), []);
  const gridEnd = useMemo(() => addDays(startOfWeekMonday(todayStr), 6), [todayStr]);

  const datesQuery = useWorkoutDatesQuery(HISTORY_FROM, gridEnd);
  const trainedByDate = useMemo(() => {
    const map = new Map<string, { programLabel: string | null; exerciseNames: string[] }>();
    for (const w of datesQuery.data ?? []) map.set(w.date, w);
    return map;
  }, [datesQuery.data]);

  const start = useMemo(() => {
    let firstWorkout: string | null = null;
    for (const date of trainedByDate.keys()) if (!firstWorkout || date < firstWorkout) firstWorkout = date;
    return historyStart(firstWorkout, history[0]?.effectiveFrom ?? null);
  }, [trainedByDate, history]);

  const weeks = useMemo(() => calendarWeeks(start, todayStr), [start, todayStr]);
  const labels = useMemo(() => monthLabels(weeks, i18n.language), [weeks, i18n.language]);

  const ready = !historyQuery.isPending && !datesQuery.isPending;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  // Cell size: 14 px when the history scrolls, up to 18 px when it is
  // stretched over the card (pure CSS on the columns) - the weekday rows
  // outside the scroll area follow the measured cell.
  const [cellPx, setCellPx] = useState(14);
  const [tip, setTip] = useState<Tip | null>(null);
  const pointerTypeRef = useRef<string>('mouse');

  // Opens on the current week: the newest column is on the right. It stays
  // pinned there on a resize or rotation, until the user scrolls away from
  // the right edge.
  const stickToEnd = useRef(true);
  // The area width at the last measure. On narrowing, Chromium re-snaps the
  // columns and fires `scroll` before the observer runs - that scroll is the
  // layout's, not the user's, and must not unpin the end.
  const measuredWidth = useRef<number | null>(null);
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    measuredWidth.current = el.clientWidth;
    const scrollable = el.scrollWidth > el.clientWidth + 1;
    // Nothing to scroll = already at the end; no scroll event would tell.
    if (!scrollable) stickToEnd.current = true;
    if (stickToEnd.current) el.scrollLeft = el.scrollWidth;
    setCanScroll(scrollable);
    const cell = el.querySelector('[data-calendar-cell]');
    if (cell) setCellPx(cell.getBoundingClientRect().height);
  }, []);

  // Before the first paint, on a new column count and on every resize.
  useLayoutEffect(() => {
    if (ready) measure();
  }, [ready, weeks.length, measure]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!ready || !el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready, measure]);

  // A tapped tooltip closes on a tap anywhere else and when the page moves.
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-calendar-cell]')) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [tip]);

  // Each day's colour, computed once per data change - not on every hover
  // (setTip re-renders the component; the grid below is memoized on this).
  const days = useMemo(() => {
    function scheduleOn(dateStr: string): number[] | null {
      let applicable: number[] | null = null;
      for (const entry of history) {
        if (entry.effectiveFrom > dateStr) break;
        applicable = entry.trainingDays;
      }
      return applicable;
    }
    function stateOf(dateStr: string): DayState {
      if (dateStr > todayStr) return 'rest';
      const trained = trainedByDate.has(dateStr);
      const schedule = scheduleOn(dateStr);
      const planned = schedule != null && schedule.includes(isoWeekday(dateStr));
      if (trained && planned) return 'trained_planned';
      if (trained && !planned) return 'trained_extra';
      if (!trained && planned && dateStr < todayStr) return 'missed_planned';
      return 'rest';
    }
    return weeks.map((monday) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = addDays(monday, d);
        const muted = date > todayStr || start == null || date < start;
        return { date, muted, state: stateOf(date), today: date === todayStr };
      }),
    );
  }, [weeks, history, trainedByDate, todayStr, start]);

  const grid = useMemo(
    () =>
      days.map((week, wi) => (
        // Stretches from 14 to 18 px; the first column's auto margin takes
        // what is left, so a short history sits on the right (current week at
        // the edge) - and it is 0 once the grid scrolls, unlike justify-end.
        <div
          key={week[0].date}
          className={`flex min-w-3.5 max-w-[18px] flex-[1_0_14px] snap-end flex-col gap-[3px] ${wi === 0 ? 'ml-auto' : ''}`}
        >
          <span className="h-4 w-full whitespace-nowrap text-[11px] leading-4 text-slate-300">{labels[wi]}</span>
          {week.map(({ date, muted, state, today }) => (
            <div
              key={date}
              data-calendar-cell
              className={`aspect-square w-full rounded-[3px] ${muted ? MUTED_COLOR : STATE_COLOR[state]} ${
                today ? 'shadow-[inset_0_0_0_1px_theme(colors.accent.DEFAULT)]' : ''
              }`}
              onPointerDown={(e) => {
                pointerTypeRef.current = e.pointerType;
              }}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse' && !muted) {
                  setTip({ date, missed: state === 'missed_planned', rect: e.currentTarget.getBoundingClientRect() });
                }
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setTip(null);
              }}
              onClick={(e) => {
                if (pointerTypeRef.current === 'mouse') return;
                // Touch: a tap opens the tooltip, a second tap (or a tap on a
                // day with no status) closes it.
                if (muted) return setTip(null);
                const rect = e.currentTarget.getBoundingClientRect();
                setTip((cur) => (cur?.date === date ? null : { date, missed: state === 'missed_planned', rect }));
              }}
            />
          ))}
        </div>
      )),
    [days, labels],
  );

  if (!ready) {
    return <p className="text-slate-400">{t('common.loadingCalendar')}</p>;
  }

  return (
    <div>
      <div className="flex gap-1.5">
        <div aria-hidden className="flex shrink-0 flex-col gap-[3px]">
          <span className="h-4" />
          {WEEKDAY_KEYS.map((key) => (
            <span
              key={key}
              className="text-[11px] text-slate-400"
              style={{ height: cellPx, lineHeight: `${cellPx}px` }}
            >
              {t(`weekdays.${key}`)}
            </span>
          ))}
        </div>
        <div
          ref={scrollRef}
          role="group"
          tabIndex={0}
          aria-label={t('calendar.gridAria')}
          // Scrollbar: Chromium 121+ ignores every ::-webkit-scrollbar rule once
          // the standard scrollbar-width/-color are set (thin = 10 px with
          // arrows), so the standard ones are only for browsers without
          // ::-webkit-scrollbar (Firefox).
          onScroll={(e) => {
            setTip(null);
            const el = e.currentTarget;
            if (el.clientWidth === measuredWidth.current) {
              stickToEnd.current = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
            }
          }}
          className="flex min-w-0 flex-1 snap-x snap-proximity gap-[3px] overflow-x-auto overscroll-x-contain pb-2 [@supports_not_selector(::-webkit-scrollbar)]:[scrollbar-color:#5a6272_#262c38] [@supports_not_selector(::-webkit-scrollbar)]:[scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#5a6272] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[#262c38] [&::-webkit-scrollbar]:h-1.5"
        >
          {grid}
        </div>
      </div>
      {canScroll && <p className="text-xs text-hint">{t('calendar.scrollHint')}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-good" /> {t('calendar.legend.trainedPlanned')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-sky-500" /> {t('calendar.legend.trainedExtra')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-500" /> {t('calendar.legend.missedPlanned')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-surface-border" /> {t('calendar.legend.rest')}
        </span>
        {/* "Missed" comes from the training schedule - say where it's set. */}
        <Link to="/schedule" className="font-semibold text-accent hover:underline">
          {t('calendar.legend.changeSchedule')}
        </Link>
      </div>
      {tip && (
        <CalendarTooltip
          rect={tip.rect}
          date={tip.date}
          info={trainedByDate.get(tip.date)}
          missed={tip.missed}
        />
      )}
    </div>
  );
}

// Rendered into <body> with position: fixed - the week strip scrolls, and an
// overflow-x container clips anything that sticks out of it (overflow-y
// becomes auto too), so an in-place tooltip would be cut off at the top.
function CalendarTooltip({
  rect,
  date,
  info,
  missed,
}: {
  rect: DOMRect;
  date: string;
  info: { programLabel: string | null; exerciseNames: string[] } | undefined;
  missed: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const { width, height } = el.getBoundingClientRect();
    // Above the cell; below it when the first row is at the top of the screen.
    let top = rect.top - height - 6;
    if (top < margin) top = rect.bottom + 6;
    // Centred on the cell, but kept inside the window for the edge columns.
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, margin),
      window.innerWidth - width - margin,
    );
    setPos({ top, left });
  }, [rect]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="pointer-events-none fixed z-50 w-52 rounded-lg border border-surface-border bg-surface-raised p-2 text-xs shadow-xl"
    >
      <p className="text-slate-300">{formatDate(date, { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      {info ? (
        <p className="mt-1 text-slate-400">
          {info.programLabel && <span className="text-accent">«{info.programLabel}» — </span>}
          {info.exerciseNames.join(', ') || t('calendar.tooltip.noExercises')}
        </p>
      ) : (
        <p className="mt-1 text-slate-400">
          {missed ? t('calendar.tooltip.missedPlannedDay') : t('calendar.tooltip.noWorkout')}
        </p>
      )}
    </div>,
    document.body,
  );
}
