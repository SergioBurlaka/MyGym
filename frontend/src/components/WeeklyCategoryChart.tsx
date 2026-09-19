import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WeeklyCategoryVolume } from '../types/index.js';

// Fixed categorical order/colors - distinct from the app's status colors
// (accent/good/warn are reserved and never reused as a series color).
const CATEGORY_SERIES = [
  { key: 'large' as const, label: 'Велика група', color: '#38bdf8' },
  { key: 'small' as const, label: 'Мала група', color: '#a78bfa' },
  { key: 'bodyweight' as const, label: 'Без ваги', color: '#fbbf24' },
];

function formatWeek(v: string) {
  return new Date(`${v}T00:00:00`).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

export default function WeeklyCategoryChart({ data }: { data: WeeklyCategoryVolume[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">Немає даних за цей період</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
        <XAxis dataKey="weekStart" tickFormatter={formatWeek} stroke="#898781" tick={{ fontSize: 11 }} />
        <YAxis stroke="#898781" tick={{ fontSize: 11 }} width={44} />
        <Tooltip
          contentStyle={{ background: '#1c2028', border: '1px solid #2a2f3a', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => `Тиждень з ${formatWeek(v as string)}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => CATEGORY_SERIES.find((s) => s.key === value)?.label ?? value} />
        {CATEGORY_SERIES.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.key} fill={s.color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
