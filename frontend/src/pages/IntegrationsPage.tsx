import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../i18n/index.js';
import Popconfirm from '../components/Popconfirm.js';
import CopyField from '../components/CopyField.js';
import { useCreateTokenMutation, useRevokeTokenMutation, useTokensQuery } from '../shared/api/tokens/index.js';
import type { CreatedApiToken } from '../shared/api/tokens/tokens.types.js';
import { useGrantsQuery, useRevokeGrantMutation } from '../shared/api/oauth/index.js';
import type { OAuthGrant } from '../shared/api/oauth/oauth.types.js';
import { translateApiError } from '../utils/apiError.js';

// formatDate in utils/weight.ts is for date-only values; tokens carry
// full timestamps and "last used" is more useful with the time.
function formatDateTime(iso: string) {
  const locale = i18n.language?.startsWith('uk') ? 'uk-UA' : 'en-US';
  return new Date(iso).toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Same origin in prod (nginx) and dev (Vite proxy) - see vite.config.ts.
function mcpUrl() {
  return `${window.location.origin}/mcp`;
}

// Setup guides, one tab per client. Texts live under
// integrations.guide.<id>.* - steps.<n>.{title,body}, tips.<tip>.{title,body}.
const GUIDES = [
  { id: 'claude', steps: 4, tips: ['everywhere', 'team'], link: 'https://claude.ai/settings/connectors' },
  { id: 'chatgpt', steps: 6, tips: ['plan', 'browser'], link: 'https://chatgpt.com' },
  { id: 'code', steps: 3, tips: ['secret'], link: null },
] as const;
type GuideId = (typeof GUIDES)[number]['id'];

export default function IntegrationsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-2">
        <h1 className="text-3xl text-slate-100">{t('integrations.title')}</h1>
        <p className="text-slate-400">{t('integrations.intro')}</p>
      </div>

      <McpUrlCard />
      <SetupGuides />
      <ConnectedApps />
      <AccessTokens />
    </div>
  );
}

function McpUrlCard() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(mcpUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API needs a secure context; the URL is selectable anyway.
    }
  }

  return (
    <section aria-labelledby="mcp-url-h" className="card flex flex-wrap items-center gap-x-6 gap-y-4 p-6">
      <div className="min-w-0 flex-1 basis-80 space-y-1">
        <h2 id="mcp-url-h" className="label mb-0 font-sans font-semibold">{t('integrations.mcpUrlTitle')}</h2>
        <code className="block select-all break-all font-mono text-lg text-white">{mcpUrl()}</code>
        <p className="text-sm text-slate-400">{t('integrations.mcpUrlHint')}</p>
      </div>
      <button type="button" className={`${copied ? 'btn-secondary' : 'btn-primary'} min-h-11`} onClick={copy}>
        <CopyIcon />
        {copied ? t('common.copied') : t('integrations.copyUrl')}
      </button>
    </section>
  );
}

function SetupGuides() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<GuideId>('claude');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const guide = GUIDES.find((g) => g.id === tab)!;

  // WAI-ARIA tabs: arrows move between tabs, Home/End jump to the ends,
  // only the selected one is in the Tab order.
  function onKeyDown(e: KeyboardEvent) {
    const index = GUIDES.findIndex((g) => g.id === tab);
    const target =
      e.key === 'ArrowRight' ? index + 1
      : e.key === 'ArrowLeft' ? index - 1
      : e.key === 'Home' ? 0
      : e.key === 'End' ? GUIDES.length - 1
      : null;
    if (target === null) return;
    e.preventDefault();
    const next = GUIDES[(target + GUIDES.length) % GUIDES.length].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const components: Record<string, ReactElement> = {
    b: <b className="font-semibold text-slate-200" />,
    code: <code className="font-mono text-slate-200" />,
    // "<TOKEN>" can't sit in the dictionary text itself - Trans would parse
    // it as a tag - so the placeholder comes in as its own element.
    token: <code className="font-mono text-slate-200">{t('integrations.tokenPlaceholder')}</code>,
    url: <code className="break-all font-mono text-slate-200">{mcpUrl()}</code>,
    ...(guide.link ? { a: <a className="text-accent hover:text-accent-hover" href={guide.link} target="_blank" rel="noopener noreferrer" /> } : {}),
  };

  return (
    <section aria-labelledby="howto-h" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 id="howto-h" className="text-2xl font-bold text-white">{t('integrations.howToTitle')}</h2>
          <p className="text-slate-400">{t('integrations.howToHint')}</p>
        </div>
        <div
          role="tablist"
          aria-label={t('integrations.howToTabs')}
          onKeyDown={onKeyDown}
          className="flex flex-wrap gap-1 rounded-xl border border-surface-border bg-surface-raised p-1"
        >
          {GUIDES.map((g) => {
            const selected = g.id === tab;
            return (
              <button
                key={g.id}
                ref={(el) => {
                  tabRefs.current[g.id] = el;
                }}
                type="button"
                role="tab"
                id={`guide-tab-${g.id}`}
                aria-selected={selected}
                aria-controls="guide-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(g.id)}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  selected ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t(`integrations.guide.${g.id}.tab`)}
              </button>
            );
          })}
        </div>
      </div>

      <div id="guide-panel" role="tabpanel" aria-labelledby={`guide-tab-${tab}`} className="flex flex-wrap gap-6">
        <div className="card min-w-0 flex-[999_1_560px] space-y-6 p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-sans text-xl font-bold tracking-normal text-white">{t(`integrations.guide.${tab}.title`)}</h3>
            <span className="rounded-full bg-accent-muted/40 px-2.5 py-0.5 text-[13px] font-semibold text-orange-200">
              {t(`integrations.guide.${tab}.badge`)}
            </span>
          </div>
          <ol className="space-y-5">
            {Array.from({ length: guide.steps }, (_, i) => i + 1).map((n) => (
              <li key={n} className="flex gap-4">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent font-bold text-white">
                  {n}
                </span>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <p className="font-semibold text-white">{t(`integrations.guide.${tab}.steps.${n}.title`)}</p>
                    <p className="text-slate-400">
                      <Trans i18nKey={`integrations.guide.${tab}.steps.${n}.body`} components={components} />
                    </p>
                  </div>
                  {tab === 'code' && n === 2 && (
                    <pre className="overflow-x-auto rounded-lg border border-surface-border bg-surface p-4 font-mono text-sm leading-relaxed text-slate-200">
                      <code>{`claude mcp add --transport http mygym \\\n  ${mcpUrl()} \\\n  --header "Authorization: Bearer ${t('integrations.tokenPlaceholder')}"`}</code>
                    </pre>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="flex flex-[1_1_280px] flex-col gap-4">
          {guide.tips.map((tip) => (
            <div key={tip} className="space-y-2 rounded-xl border border-surface-border bg-surface p-5">
              <p className="font-semibold text-white">{t(`integrations.guide.${tab}.tips.${tip}.title`)}</p>
              <p className="text-[15px] text-slate-400">{t(`integrations.guide.${tab}.tips.${tip}.body`)}</p>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}

// Apps connected by signing in (OAuth: Claude, ChatGPT) - no token to copy,
// one row per connection; revoking cuts its access and refresh tokens.
function ConnectedApps() {
  const { t } = useTranslation();
  const grantsQuery = useGrantsQuery();

  return (
    <section aria-labelledby="apps-h" className="space-y-4">
      <div className="space-y-1">
        <h2 id="apps-h" className="text-xl font-bold text-white">{t('integrations.connectedApps')}</h2>
        <p className="text-slate-400">{t('integrations.connectedAppsHint')}</p>
      </div>
      {grantsQuery.isPending && <p className="text-slate-400">{t('common.loading')}</p>}
      {grantsQuery.data?.length === 0 && <p className="text-slate-400">{t('integrations.noConnectedApps')}</p>}
      {grantsQuery.data?.map((grant) => (
        <GrantRow key={grant.id} grant={grant} />
      ))}
    </section>
  );
}

function GrantRow({ grant }: { grant: OAuthGrant }) {
  const { t } = useTranslation();
  const revokeMutation = useRevokeGrantMutation();

  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent-muted/30 text-accent">
        <AppIcon />
      </span>
      <div className="min-w-0 flex-1 basis-40">
        {revokeMutation.isError && (
          <p className="text-sm text-red-400">{translateApiError(revokeMutation.error, t, 'integrations.revokeError')}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2.5">
          <p className="truncate text-[17px] font-semibold text-white">{grant.clientName}</p>
          {/* Revoked grants drop out of the list, so every row shown is live. */}
          <span className="inline-flex items-center gap-1.5 text-[13px] text-good">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-good" />
            {t('integrations.active')}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          <span className="font-mono">{new URL(grant.clientId).hostname}</span>
          {' · '}
          {t('integrations.connectedAt', { date: formatDateTime(grant.createdAt) })}
          {' · '}
          {grant.lastUsedAt ? t('integrations.lastUsed', { date: formatDateTime(grant.lastUsedAt) }) : t('integrations.neverUsed')}
        </p>
      </div>
      <div className="ml-auto">
        <Popconfirm
          title={t('integrations.disconnectConfirmTitle')}
          description={t('integrations.disconnectConfirmDescription', { name: grant.clientName })}
          confirmText={t('integrations.disconnect')}
          onConfirm={() => revokeMutation.mutate(grant.id)}
        >
          <button type="button" className="btn min-h-11 shrink-0 border border-red-900 text-red-400 hover:bg-red-950/40" disabled={revokeMutation.isPending}>
            {t('integrations.disconnect')}
          </button>
        </Popconfirm>
      </div>
    </div>
  );
}

function AccessTokens() {
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
    <section aria-labelledby="tokens-h" className="space-y-4">
      <div className="space-y-1">
        <h2 id="tokens-h" className="text-xl font-bold text-white">{t('integrations.tokensTitle')}</h2>
        <p className="max-w-3xl text-slate-400">{t('integrations.tokensHint')}</p>
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

      <form onSubmit={handleCreate} className="card flex flex-wrap items-end gap-x-4 gap-y-3 px-6 py-5">
        <div className="flex-1 basis-80">
          <label className="label" htmlFor="token-name">{t('integrations.nameLabel')}</label>
          <input
            id="token-name"
            className="input min-h-11"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary min-h-11" disabled={createMutation.isPending || !name.trim()}>
          {createMutation.isPending ? t('integrations.creating') : t('integrations.create')}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {tokensQuery.isPending && <p className="text-slate-400">{t('common.loading')}</p>}
      {tokensQuery.data?.length === 0 && <p className="text-slate-400">{t('integrations.empty')}</p>}
      {tokensQuery.data?.map((token) => (
        <TokenRow key={token.id} id={token.id} name={token.name} createdAt={token.createdAt} lastUsedAt={token.lastUsedAt} />
      ))}
    </section>
  );
}

function TokenRow({ id, name, createdAt, lastUsedAt }: { id: string; name: string; createdAt: string; lastUsedAt: string | null }) {
  const { t } = useTranslation();
  const revokeMutation = useRevokeTokenMutation();

  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-surface text-slate-400">
        <KeyIcon />
      </span>
      <div className="min-w-0 flex-1 basis-40">
        {/* Revoking is the security action - a failure must not pass silently. */}
        {revokeMutation.isError && (
          <p className="text-sm text-red-400">{translateApiError(revokeMutation.error, t, 'integrations.revokeError')}</p>
        )}
        <p className="truncate text-[17px] font-semibold text-white">{name}</p>
        <p className="text-sm text-slate-400">
          <span className="font-mono">mygym_pat_••••</span>
          {' · '}
          {t('integrations.createdAt', { date: formatDateTime(createdAt) })}
          {' · '}
          {lastUsedAt ? t('integrations.lastUsed', { date: formatDateTime(lastUsedAt) }) : t('integrations.neverUsed')}
        </p>
      </div>
      <div className="ml-auto">
        <Popconfirm
          title={t('integrations.revokeConfirmTitle')}
          description={t('integrations.revokeConfirmDescription', { name })}
          confirmText={t('integrations.revoke')}
          onConfirm={() => revokeMutation.mutate(id)}
        >
          <button type="button" className="btn min-h-11 shrink-0 border border-red-900 text-red-400 hover:bg-red-950/40" disabled={revokeMutation.isPending}>
            {t('integrations.revoke')}
          </button>
        </Popconfirm>
      </div>
    </div>
  );
}

// Shown right after creation - the only moment the raw token is available.
function CreatedTokenCard({ token, onDone }: { token: CreatedApiToken; onDone: () => void }) {
  const { t } = useTranslation();
  const mcpCommand = `claude mcp add --transport http mygym ${mcpUrl()} --header "Authorization: Bearer ${token.token}"`;
  return (
    <div className="card space-y-4 border-accent p-6">
      <div>
        <h3 className="font-sans text-lg font-semibold tracking-normal text-slate-100">{t('integrations.createdTitle', { name: token.name })}</h3>
        <p className="mt-1 text-sm text-warn">{t('integrations.createdWarning')}</p>
      </div>
      <CopyField label={t('integrations.tokenLabel')} value={token.token} />
      <CopyField label={t('integrations.claudeCodeLabel')} value={mcpCommand} />
      <button type="button" className="btn-secondary" onClick={onDone}>{t('integrations.done')}</button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function AppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2" />
    </svg>
  );
}
