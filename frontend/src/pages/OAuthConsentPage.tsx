import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';
import { useOAuthDecisionMutation, useOAuthRequestQuery } from '../shared/api/oauth/index.js';
import { translateApiError } from '../utils/apiError.js';

// "May <Claude / ChatGPT> access your MyGym?" - where /api/oauth/authorize
// sends the browser. Approving mints a one-time code and returns the
// browser to the client; denying returns it with access_denied.
export default function OAuthConsentPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  // Untrusted client or redirect URI: the backend refused to send the
  // browser back there, so this page is the end of the road.
  if (error) {
    return (
      <ConsentShell>
        <h1 className="text-2xl text-slate-100">{t('oauth.consent.errorTitle')}</h1>
        <p className="text-slate-300">{t(`oauth.consent.error.${error}`, { defaultValue: t('oauth.consent.error.generic') })}</p>
      </ConsentShell>
    );
  }
  return <ConsentForLoggedInUser requestId={searchParams.get('request')} />;
}

function ConsentForLoggedInUser({ requestId }: { requestId: string | null }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const location = useLocation();
  const requestQuery = useOAuthRequestQuery(user ? requestId : null);
  const decision = useOAuthDecisionMutation(requestId ?? '');

  if (loading) return <ConsentShell><p className="text-slate-400">{t('common.loading')}</p></ConsentShell>;
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  if (!requestId || requestQuery.isError) {
    return (
      <ConsentShell>
        <h1 className="text-2xl text-slate-100">{t('oauth.consent.errorTitle')}</h1>
        <p className="text-slate-300">{t('oauth.consent.error.oauth_request_expired')}</p>
      </ConsentShell>
    );
  }
  if (requestQuery.isPending) return <ConsentShell><p className="text-slate-400">{t('common.loading')}</p></ConsentShell>;

  const info = requestQuery.data;
  // A redirect is about to happen - keep the buttons from being pressed twice.
  const leaving = decision.isPending || decision.isSuccess;

  async function choose(approve: boolean) {
    const { redirectTo } = await decision.mutateAsync(approve);
    window.location.assign(redirectTo);
  }

  return (
    <ConsentShell>
      <h1 className="text-2xl text-slate-100">{t('oauth.consent.title', { client: info.clientName })}</h1>
      <p className="text-slate-300">{t('oauth.consent.access')}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
        <li>{t('oauth.consent.canRead')}</li>
        <li>{t('oauth.consent.canWrite')}</li>
        <li>{t('oauth.consent.cannot')}</li>
      </ul>
      {/* A self-registered client chose its own name - the redirect host is
          the one thing that says where the access really goes. */}
      {!info.verified && (
        <p role="alert" className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm text-warn">
          {t('oauth.consent.unverified', { client: info.clientName, host: info.redirectHost })}
        </p>
      )}
      {/* The MCP spec requires showing where the browser goes back to -
          it's how a user can spot an impostor. */}
      <dl className="space-y-1 rounded-lg border border-surface-border bg-surface p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">{t('oauth.consent.client')}</dt>
          <dd className={info.verified ? 'font-mono text-slate-100' : 'text-warn'}>
            {info.clientHost ?? t('oauth.consent.unverifiedClient')}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">{t('oauth.consent.returnsTo')}</dt>
          <dd className={`font-mono ${info.verified ? 'text-slate-100' : 'font-bold text-warn'}`}>{info.redirectHost}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">{t('oauth.consent.account')}</dt>
          <dd className="truncate text-slate-100">{user.email}</dd>
        </div>
      </dl>
      {decision.isError && (
        <p className="text-sm text-red-400">{translateApiError(decision.error, t, 'oauth.consent.error.generic')}</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button className="btn-primary flex-1" disabled={leaving} onClick={() => choose(true)}>
          {leaving ? t('oauth.consent.redirecting') : t('oauth.consent.allow')}
        </button>
        <button className="btn-secondary flex-1" disabled={leaving} onClick={() => choose(false)}>
          {t('oauth.consent.deny')}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {t('oauth.consent.revokeHint')}{' '}
        <Link to="/integrations" className="text-accent hover:underline">{t('nav.integrations')}</Link>
      </p>
    </ConsentShell>
  );
}

function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    // Also shown logged out (errors) - no Navbar then, so clear the status bar.
    <div className="flex min-h-[70vh] items-center justify-center pt-[env(safe-area-inset-top)]">
      <div className="card w-full max-w-md space-y-4">{children}</div>
    </div>
  );
}
