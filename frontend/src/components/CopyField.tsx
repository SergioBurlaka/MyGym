import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API needs a secure context; the text is selectable anyway.
    }
  }

  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-surface-border bg-surface px-3 py-2 font-mono text-xs text-slate-100">
          {value}
        </code>
        <button type="button" className="btn-secondary shrink-0" onClick={copy}>
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
    </div>
  );
}
