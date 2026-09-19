import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Point = { date: string; value: number | null };

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
          tickFormatter={(v) => new Date(`${v}T00:00:00`).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}
          stroke="#898781"
          tick={{ fontSize: 11 }}
        />
        <YAxis stroke="#898781" tick={{ fontSize: 11 }} width={40} />
        <Tooltip
          contentStyle={{ background: '#1c2028', border: '1px solid #2a2f3a', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => new Date(`${v}T00:00:00`).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' })}
          formatter={(value: number) => [`${value} ${unit}`, undefined]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
