import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WeeklyCategoryVolume } from '../types/index.js';
import { formatDate } from '../utils/weight.js';

// Fixed categorical order/colors - distinct from the app's status colors
// (accent/good/warn are reserved and never reused as a series color).
const CATEGORY_SERIES = [
  { key: 'large' as const, color: '#38bdf8' },
  { key: 'small' as const, color: '#a78bfa' },
  { key: 'bodyweight' as const, color: '#fbbf24' },
];

function formatWeek(v: string) {
  return formatDate(v, { day: '2-digit', month: '2-digit' });
}

export default function WeeklyCategoryChart({ data }: { data: WeeklyCategoryVolume[] }) {
  const { t } = useTranslation();
  const categoryLabel = (key: string) => t(`exercises.category.${key}`);

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">{t('progress.noPeriodData')}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
        <XAxis dataKey="weekStart" tickFormatter={formatWeek} stroke="#898781" tick={{ fontSize: 11 }} />
        <YAxis stroke="#898781" tick={{ fontSize: 11 }} width={44} />
        <Tooltip
          contentStyle={{ background: '#1c2028', border: '1px solid #2a2f3a', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => t('progress.weekOf', { date: formatWeek(v as string) })}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => categoryLabel(value as string)} />
        {CATEGORY_SERIES.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.key} fill={s.color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
