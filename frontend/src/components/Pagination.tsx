import { useTranslation } from 'react-i18next';

function pageWindow(current: number, total: number): (number | 'ellipsis')[] {
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('ellipsis');
    result.push(sorted[i]);
  }
  return result;
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  disabled,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-1" aria-label={t('pagination.label')}>
      <button
        className="btn-secondary px-3 py-1.5 text-sm"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
      >
        ←
      </button>

      {pageWindow(page, totalPages).map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-500">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            disabled={disabled}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              p === page
                ? 'border-accent bg-accent/10 text-slate-100'
                : 'border-surface-border bg-surface-raised text-slate-300 hover:border-slate-600'
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        className="btn-secondary px-3 py-1.5 text-sm"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
      >
        →
      </button>
    </nav>
  );
}
