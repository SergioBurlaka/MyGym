import { startTransition, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactNumber, formatDate, formatKg } from '../utils/weight.js';
import ChartSkeleton from './ChartSkeleton.js';

type Point = { date: string; value: number | null; isPR?: boolean };

function PrDot(color: string) {
  return ({ cx, cy, payload, index }: any) => {
    const key = `dot-${index}`;
    if (cx == null || cy == null) return <g key={key} />;
    if (payload.isPR) {
      return <circle key={key} cx={cx} cy={cy} r={6} fill={color} stroke="#f5f5f4" strokeWidth={2} />;
    }
    return <circle key={key} cx={cx} cy={cy} r={3} fill={color} />;
  };
}

function ChartTooltip({ active, payload, unit }: any) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div
      style={{ background: '#1c2028', border: '1px solid #2a2f3a', borderRadius: 8 }}
      className="px-3 py-2 text-xs"
    >
      <p className="text-slate-400">{formatDate(point.date, { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      <p className="mt-0.5 font-medium text-slate-100">
        {point.value == null ? '—' : formatKg(point.value)} {unit}
      </p>
      {point.isPR && <p className="mt-0.5 text-accent">{t('progress.charts.prBadge')}</p>}
    </div>
  );
}

export default function ProgressChart({
  data,
  color,
  unit,
  emptyLabel,
  label,
}: {
  data: Point[];
  color: string;
  unit: string;
  emptyLabel: string;
  /** Chart name for the screen-reader summary, e.g. the card heading. */
  label: string;
}) {
  const { t } = useTranslation();
  // Recharts is the heaviest render here (Progress page: four of these took
  // ~360 ms of a 4x-throttled phone's main thread at once, the tap that opened
  // the page froze until they were done). So the chart is drawn in a transition
  // after the page shows: React renders it in slices and keeps taps and
  // animations going. Until then its skeleton, of the chart's height, so nothing
  // jumps. The width is measured here, also in a transition - Recharts'
  // ResponsiveContainer measures itself and sets its state outside of one, which
  // renders the whole chart in one blocking go again.
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const points = data.filter((d) => d.value != null);
  const hasPoints = points.length > 0;
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      const w = Math.floor(box.clientWidth);
      startTransition(() => setWidth(w));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [hasPoints]);

  if (!hasPoints) {
    return <p className="py-8 text-center text-sm text-slate-400">{emptyLabel}</p>;
  }

  // The SVG itself says nothing to a screen reader - expose the trend as text.
  const first = points[0];
  const last = points[points.length - 1];
  const summary = t(points.length === 1 ? 'progress.charts.summarySingle' : 'progress.charts.summary', {
    label,
    first: first.value == null ? first.value : formatKg(first.value),
    last: last.value == null ? last.value : formatKg(last.value),
    unit,
    from: formatDate(first.date),
    to: formatDate(last.date),
  });

  return (
    <div ref={boxRef} role="img" aria-label={summary} className="h-[220px]">
      {width === 0 ? (
        <ChartSkeleton className="h-full" />
      ) : (
        <LineChart width={width} height={220} data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatDate(v, { day: '2-digit', month: '2-digit' })}
            stroke="#898781"
            tick={{ fontSize: 11 }}
          />
          <YAxis stroke="#898781" tick={{ fontSize: 11 }} width={56} tickFormatter={formatCompactNumber} />
          <Tooltip content={<ChartTooltip unit={unit} />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={PrDot(color)}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </div>
  );
}
