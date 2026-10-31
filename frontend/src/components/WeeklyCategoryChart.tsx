import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WeeklyCategoryVolume } from '../types/index.js';
import { addDays, todayIso } from '../utils/date.js';
import { formatDate } from '../utils/weight.js';
import { fillWeeks, niceMax } from '../utils/weeklyVolume.js';

// Fixed categorical order/colors - distinct from the app's status colors
// (accent/good/warn are reserved and never reused as a series color). The
// pair passes the dataviz palette check on the #1c2028 card: CVD ΔE 14.2,
// contrast >= 3:1. "No weight" is counted in reps, not kg - on a shared axis
// its bars vanished next to 16 000 kg, so it is only a number in the week
// detail below.
const CATEGORY_SERIES = [
  { key: 'large' as const, color: '#3b82f6' },
  { key: 'small' as const, color: '#d0609b' },
];

const CHART_HEIGHT = 168;

// Drawn by hand, not with Recharts: the strip is wider than the card and
// scrolls, while the Y axis stays put - ResponsiveContainer can't be wider
// than its box, and each week is a button (tap -> numbers, keyboard focus).
export default function WeeklyCategoryChart({ data }: { data: WeeklyCategoryVolume[] }) {
  const { t, i18n } = useTranslation();
  const todayStr = useMemo(() => todayIso(), []);
  const weeks = useMemo(() => fillWeeks(data, todayStr), [data, todayStr]);
  const max = useMemo(() => niceMax(Math.max(0, ...weeks.map((w) => Math.max(w.large, w.small)))), [weeks]);

  const [selected, setSelected] = useState<string | null>(null);
  const current = weeks.find((w) => w.weekStart === selected) ?? weeks[weeks.length - 1];

  const scrollRef = useRef<HTMLDivElement>(null);
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
  const num = (n: number) => Math.round(n).toLocaleString(i18n.language);
  const kg = (n: number) => `${num(n)} ${t('common.kg')}`;
  const reps = (n: number) => `${num(n)} ${t('common.reps')}`;
  const axis = (v: number) =>
    v >= 1000
      ? t('progress.axisTonnes', { value: (v / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 1 }) })
      : kg(v);
  const barHeight = (v: number) => (v > 0 ? Math.max(2, Math.round((v / max) * CHART_HEIGHT)) : 0);
  // Every other week is labelled, counted from the current one so it always has its date.
  const labelled = (i: number) => (weeks.length - 1 - i) % 2 === 0;

  // The bars say nothing to a screen reader - expose period totals as text.
  const total = (key: keyof Omit<WeeklyCategoryVolume, 'weekStart'>) => Math.round(weeks.reduce((sum, w) => sum + w[key], 0));
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
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-slate-300" aria-hidden="true">
        {CATEGORY_SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            {t(`progress.legend.${s.key}`)}
          </span>
        ))}
      </div>

      <div className="flex gap-1.5">
        <div aria-hidden="true" className="relative w-[34px] shrink-0" style={{ height: CHART_HEIGHT }}>
          {[3, 2, 1, 0].map((k) => (
            <span
              key={k}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[10px] text-slate-400"
              style={{ top: ((3 - k) * CHART_HEIGHT) / 3 }}
            >
              {k === 0 ? '0' : axis((max * k) / 3)}
            </span>
          ))}
        </div>
        <div
          ref={scrollRef}
          role="group"
          aria-label={t('progress.chartAria')}
          className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-color:#3a4150_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-sm [&::-webkit-scrollbar-thumb]:bg-[#3a4150] [&::-webkit-scrollbar]:h-1"
        >
          <div className="relative flex w-max">
            {[0, 1, 2].map((k) => (
              <div
                key={k}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-surface-border"
                style={{ top: (k * CHART_HEIGHT) / 3 }}
              />
            ))}
            {weeks.map((w, i) => {
              const isSelected = w.weekStart === current.weekStart;
              return (
                <button
                  key={w.weekStart}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={t('progress.weekAria', {
                    date: dm(w.weekStart),
                    large: kg(w.large),
                    small: kg(w.small),
                    bodyweight: reps(w.bodyweight),
                  })}
                  onClick={() => setSelected(w.weekStart)}
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'mouse') setSelected(w.weekStart);
                  }}
                  className={`relative flex w-[30px] flex-col items-center rounded-md ${isSelected ? 'bg-white/[0.06]' : ''}`}
                >
                  <span
                    className="flex w-full items-end justify-center gap-0.5 border-b border-[#3a4150]"
                    style={{ height: CHART_HEIGHT }}
                  >
                    {CATEGORY_SERIES.map((s) => (
                      <span
                        key={s.key}
                        className="w-2.5 rounded-t-[3px]"
                        style={{ height: barHeight(w[s.key]), background: s.color }}
                      />
                    ))}
                  </span>
                  <span className="h-5 whitespace-nowrap text-[10px] leading-5 text-slate-400">
                    {labelled(i) ? dm(w.weekStart) : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div aria-live="polite" className="flex flex-col gap-1.5 rounded-[10px] bg-surface px-3 py-2.5">
        <b className="text-[13px] text-slate-100">
          {t('progress.weekRange', { from: dm(current.weekStart), to: dm(addDays(current.weekStart, 6)) })}
        </b>
        <div className="grid grid-cols-3 gap-1.5 text-xs text-slate-400">
          {CATEGORY_SERIES.map((s) => (
            <span key={s.key} className="flex flex-col gap-px">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {t(`progress.week.${s.key}`)}
              </span>
              <b className="text-sm text-white">{kg(current[s.key])}</b>
            </span>
          ))}
          <span className="flex flex-col gap-px">
            <span>{t('progress.week.bodyweight')}</span>
            <b className="text-sm text-white">{reps(current.bodyweight)}</b>
          </span>
        </div>
      </div>
      {canScroll && <p className="text-xs text-hint">{t('progress.scrollHint')}</p>}
    </div>
  );
}
