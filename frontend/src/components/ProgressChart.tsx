import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Point = { date: string; value: number | null; isPR?: boolean };

function formatDateUk(v: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${v}T00:00:00`).toLocaleDateString('uk-UA', opts);
}

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
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div
      style={{ background: '#1c2028', border: '1px solid #2a2f3a', borderRadius: 8 }}
      className="px-3 py-2 text-xs"
    >
      <p className="text-slate-400">{formatDateUk(point.date, { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      <p className="mt-0.5 font-medium text-slate-100">
        {point.value} {unit}
      </p>
      {point.isPR && <p className="mt-0.5 text-accent">🏆 Особистий рекорд</p>}
    </div>
  );
}

export default function ProgressChart({
  data,
  color,
  unit,
  emptyLabel,
}: {
  data: Point[];
  color: string;
  unit: string;
  emptyLabel: string;
}) {
  const points = data.filter((d) => d.value != null);

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatDateUk(v, { day: '2-digit', month: '2-digit' })}
          stroke="#898781"
          tick={{ fontSize: 11 }}
        />
        <YAxis stroke="#898781" tick={{ fontSize: 11 }} width={40} />
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
    </ResponsiveContainer>
  );
}
