import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WeeklyCategoryVolume } from '../types/index.js';
import { addDays, todayIso } from '../utils/date.js';
import { formatDate } from '../utils/weight.js';
import { fillWeeks, niceMax, repsMax, weekAverage } from '../utils/weeklyVolume.js';

type SeriesKey = keyof Omit<WeeklyCategoryVolume, 'weekStart'>;

// Fixed categorical order/colors - distinct from the app's status colors
// (accent/good/warn are reserved and never reused as a series color). The
// trio passes the dataviz palette check on the #1c2028 card (all pairs: CVD
// ΔE >= 14.2, contrast >= 3:1). "No weight" is counted in reps, not kg, so it
// has its own scale on the right - a dual axis by the user's choice; the scale
// captions, the legend, the exact numbers in the tiles and each week's
// aria-label keep the two units apart.
const SERIES: { key: SeriesKey; color: string; unit: 'kg' | 'reps' }[] = [
  { key: 'large', color: '#3b82f6', unit: 'kg' },
  { key: 'small', color: '#d0609b', unit: 'kg' },
  { key: 'bodyweight', color: '#c98500', unit: 'reps' },
];

// Chart area: 14 px on top for the scale captions, bars up to 126 px.
const AREA_HEIGHT = 140;
const TOP_PAD = 14;
const BAR_MAX = AREA_HEIGHT - TOP_PAD;

// Drawn by hand, not with Recharts: the strip is wider than the card and
// scrolls, and each week is a button (tap -> the tiles above, keyboard focus).
export default function WeeklyCategoryChart({ data }: { data: WeeklyCategoryVolume[] }) {
  const { t, i18n } = useTranslation();
  const todayStr = useMemo(() => todayIso(), []);
  const weeks = useMemo(() => fillWeeks(data, todayStr), [data, todayStr]);
  // One scale per unit for the whole history, so bars don't change while scrolling.
  const kgMax = useMemo(() => niceMax(Math.max(0, ...weeks.map((w) => Math.max(w.large, w.small)))), [weeks]);
  const bwMax = useMemo(() => repsMax(Math.max(0, ...weeks.map((w) => w.bodyweight))), [weeks]);

  const [selected, setSelected] = useState<string | null>(null);
  const foundIndex = weeks.findIndex((w) => w.weekStart === selected);
  const currentIndex = foundIndex >= 0 ? foundIndex : weeks.length - 1;
  const current = weeks[currentIndex];
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Scrollbar: Chromium 121+ ignores every ::-webkit-scrollbar rule once the
  // standard scrollbar-width/-color are set, so those are Firefox-only here.
  const [canScroll, setCanScroll] = useState(false);

  // Opens on the current week: the newest column is on the right.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks.length]);

  // The "scroll left" hint only when there is something to scroll to.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setCanScroll(el.scrollWidth > el.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [weeks.length]);

  if (weeks.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{t('progress.noPeriodData')}</p>;
  }

  const dm = (iso: string) => formatDate(iso, { day: '2-digit', month: '2-digit' });
  // With the whole history 26.10 can be two different years - add it off this year.
  const thisYear = todayStr.slice(0, 4);
  const dmy = (iso: string) =>
    iso.slice(0, 4) === thisYear ? dm(iso) : formatDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const num = (n: number) => Math.round(n).toLocaleString(i18n.language);
  const kg = (n: number) => `${num(n)} ${t('common.kg')}`;
  const reps = (n: number) => `${num(n)} ${t('common.reps')}`;
  // "16,1 t" from a tonne up, "850 kg" under it.
  const weight = (v: number) =>
    v >= 1000
      ? t('progress.axisTonnes', { value: (v / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 1 }) })
      : kg(v);
  const value = (key: SeriesKey, v: number) => (key === 'bodyweight' ? reps(v) : weight(v));
  const barHeight = (key: SeriesKey, v: number) => {
    if (v <= 0) return 0;
    return Math.max(2, Math.round((v / (key === 'bodyweight' ? bwMax : kgMax)) * BAR_MAX));
  };
  // Every 4th week is labelled, counted from the current one so it always has its date.
  const labelled = (i: number) => (weeks.length - 1 - i) % 4 === 0;
  const isCurrentWeek = currentIndex === weeks.length - 1;

  // The bars say nothing to a screen reader - expose period totals as text.
  const total = (key: SeriesKey) => Math.round(weeks.reduce((sum, w) => sum + w[key], 0));
  const summary = t('progress.weeklyVolumeSummary', {
    from: formatDate(weeks[0].weekStart),
    to: formatDate(weeks[weeks.length - 1].weekStart),
    large: total('large'),
    small: total('small'),
    bodyweight: total('bodyweight'),
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only">{summary}</p>

      <div className="flex flex-col gap-2">
        <b aria-live="polite" className="text-sm text-slate-100">
          {t('progress.weekRange', { from: dm(current.weekStart), to: dmy(addDays(current.weekStart, 6)) })}
          {isCurrentWeek && ` · ${t('progress.current')}`}
        </b>
        <div className="grid grid-cols-3 gap-1.5">
          {SERIES.map((s) => {
            const v = current[s.key];
            const avg = weekAverage(weeks, currentIndex, s.key);
            const pct = avg > 0 ? Math.round(((v - avg) / avg) * 100) : null;
            return (
              <div key={s.key} className="flex min-w-0 flex-col gap-[3px] rounded-[10px] bg-surface p-2">
                <span className="flex items-center gap-[5px] text-[11px] text-slate-400">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span className="truncate">{t(`progress.week.${s.key}`)}</span>
                </span>
                <b className="text-[17px] text-white">{value(s.key, v)}</b>
                {pct != null && (
                  <span className={`text-[11px] ${pct >= 0 ? 'text-good' : 'text-red-300'}`}>
                    {t(pct >= 0 ? 'progress.vsAverageUp' : 'progress.vsAverageDown', { pct: Math.abs(pct) })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <span className="text-[11px] text-hint">{t('progress.averageNote')}</span>
      </div>

      <div className="relative">
        {/* Scale captions stay put while the weeks scroll under them. */}
        <span aria-hidden="true" className="pointer-events-none absolute left-0 top-[-2px] z-[1] text-[10px] text-hint">
          {weight(kgMax)}
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute right-0 top-[-2px] z-[1] text-[10px] text-slate-400">
          {reps(bwMax)}
        </span>
        <div
          ref={scrollRef}
          role="group"
          aria-label={t('progress.chartAria')}
          className="overflow-x-auto overscroll-x-contain pb-2.5 [@supports_not_selector(::-webkit-scrollbar)]:[scrollbar-color:#5a6272_#262c38] [@supports_not_selector(::-webkit-scrollbar)]:[scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#5a6272] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[#262c38] [&::-webkit-scrollbar]:h-1.5"
        >
          <div className="w-max min-w-full">
            <div className="relative flex items-end gap-0.5 border-b border-[#3a4150]" style={{ height: AREA_HEIGHT }}>
              {/* Grid: the top of the scale and its half. */}
              {[TOP_PAD, TOP_PAD + BAR_MAX / 2].map((top) => (
                <div
                  key={top}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 border-t border-surface-border"
                  style={{ top }}
                />
              ))}
              {weeks.map((w, i) => {
                const isSelected = i === currentIndex;
                return (
                  <button
                    key={w.weekStart}
                    ref={(el) => {
                      buttonsRef.current[i] = el;
                    }}
                    type="button"
                    // One Tab stop for the whole strip; arrows move between weeks.
                    tabIndex={isSelected ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-label={t('progress.weekAria', {
                      date: dmy(w.weekStart),
                      large: kg(w.large),
                      small: kg(w.small),
                      bodyweight: reps(w.bodyweight),
                    })}
                    onClick={() => setSelected(w.weekStart)}
                    onKeyDown={(e) => {
                      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                      const next = weeks[i + step];
                      if (!step || !next) return;
                      e.preventDefault();
                      setSelected(next.weekStart);
                      buttonsRef.current[i + step]?.focus();
                    }}
                    onPointerEnter={(e) => {
                      if (e.pointerType === 'mouse') setSelected(w.weekStart);
                    }}
                    className={`relative flex h-full w-[39px] shrink-0 items-end justify-center gap-0.5 rounded-t px-px outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                      isSelected ? 'bg-white/[0.07]' : ''
                    }`}
                  >
                    {SERIES.map((s) => (
                      <span
                        key={s.key}
                        className="w-[11px] rounded-t-[3px]"
                        style={{ height: barHeight(s.key, w[s.key]), background: s.color }}
                      />
                    ))}
                  </button>
                );
              })}
            </div>
            <div aria-hidden="true" className="mt-1 flex gap-0.5">
              {weeks.map((w, i) => (
                <span key={w.weekStart} className="w-[39px] shrink-0 whitespace-nowrap text-[10px] text-slate-400">
                  {labelled(i) ? dm(w.weekStart) : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {canScroll && <p className="-mt-1 text-xs text-hint">{t('progress.scrollHint')}</p>}

      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-slate-300" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            {t(`progress.legend.${s.key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
