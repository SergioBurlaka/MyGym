import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/index.js';
import Popconfirm from '../components/Popconfirm.js';
import { useCreateTokenMutation, useRevokeTokenMutation, useTokensQuery } from '../shared/api/tokens/index.js';
import type { CreatedApiToken } from '../shared/api/tokens/tokens.types.js';
import { translateApiError } from '../utils/apiError.js';

// formatDate in utils/weight.ts is for date-only values; tokens carry
// full timestamps and "last used" is more useful with the time.
function formatDateTime(iso: string) {
  const locale = i18n.language?.startsWith('uk') ? 'uk-UA' : 'en-US';
  return new Date(iso).toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function IntegrationsPage() {
  const { t } = useTranslation();
  const tokensQuery = useTokensQuery();
  const createMutation = useCreateTokenMutation();
  const [name, setName] = useState('Claude Code');
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setCreated(await createMutation.mutateAsync(name.trim()));
    } catch (err) {
      setError(translateApiError(err, t, 'integrations.createError'));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-slate-100">{t('integrations.title')}</h1>
        <p className="mt-2 text-slate-400">{t('integrations.intro')}</p>
      </div>

      {created && (
        <CreatedTokenCard
          token={created}
          onDone={() => {
            setCreated(null);
            createMutation.reset(); // drops the raw token from the mutation state too
          }}
        />
      )}

      <form onSubmit={handleCreate} className="card flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="token-name">{t('integrations.nameLabel')}</label>
          <input
            id="token-name"
            className="input"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={createMutation.isPending || !name.trim()}>
          {createMutation.isPending ? t('integrations.creating') : t('integrations.create')}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">{t('integrations.activeTokens')}</h2>
        {tokensQuery.isPending && <p className="text-slate-400">{t('common.loading')}</p>}
        {tokensQuery.data?.length === 0 && <p className="text-slate-400">{t('integrations.empty')}</p>}
        {tokensQuery.data?.map((token) => (
          <TokenRow key={token.id} id={token.id} name={token.name} createdAt={token.createdAt} lastUsedAt={token.lastUsedAt} />
        ))}
      </section>
    </div>
  );
}

function TokenRow({ id, name, createdAt, lastUsedAt }: { id: string; name: string; createdAt: string; lastUsedAt: string | null }) {
  const { t } = useTranslation();
  const revokeMutation = useRevokeTokenMutation();

  return (
    <div className="card flex items-center justify-between gap-4">
      <div className="min-w-0">
        {/* Revoking is the security action - a failure must not pass silently. */}
        {revokeMutation.isError && (
          <p className="text-sm text-red-400">{translateApiError(revokeMutation.error, t, 'integrations.revokeError')}</p>
        )}
        <p className="truncate font-semibold text-slate-100">{name}</p>
        <p className="text-sm text-slate-400">
          <span className="font-mono">mygym_pat_••••</span>
          {' · '}
          {t('integrations.createdAt', { date: formatDateTime(createdAt) })}
          {' · '}
          {lastUsedAt ? t('integrations.lastUsed', { date: formatDateTime(lastUsedAt) }) : t('integrations.neverUsed')}
        </p>
      </div>
      <Popconfirm
        title={t('integrations.revokeConfirmTitle')}
        description={t('integrations.revokeConfirmDescription', { name })}
        confirmText={t('integrations.revoke')}
        onConfirm={() => revokeMutation.mutate(id)}
      >
        <button className="btn-ghost shrink-0 text-red-400" disabled={revokeMutation.isPending}>
          {t('integrations.revoke')}
        </button>
      </Popconfirm>
    </div>
  );
}

// Shown right after creation - the only moment the raw token is available.
function CreatedTokenCard({ token, onDone }: { token: CreatedApiToken; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="card space-y-4 border-accent">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">{t('integrations.createdTitle', { name: token.name })}</h2>
        <p className="mt-1 text-sm text-warn">{t('integrations.createdWarning')}</p>
      </div>
      <CopyField label={t('integrations.tokenLabel')} value={token.token} />
      <button className="btn-secondary" onClick={onDone}>{t('integrations.done')}</button>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
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
          {copied ? t('integrations.copied') : t('integrations.copy')}
        </button>
      </div>
    </div>
  );
}
