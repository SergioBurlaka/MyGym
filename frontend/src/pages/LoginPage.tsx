import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useAuth } from '../context/AuthContext.js';
import PasswordInput from '../components/PasswordInput.js';
import GoogleSignInButton from '../components/GoogleSignInButton.js';
import { translateApiError } from '../utils/apiError.js';
import { safeNext } from '../utils/safeNext.js';
import { useAuthProvidersQuery } from '../shared/api/auth/index.js';

export default function LoginPage() {
  const { t } = useTranslation();
  usePageTitle(t('auth.login.submit'));
  const { login, loginDemo } = useAuth();
  const providersQuery = useAuthProvidersQuery();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // The Google callback lands here as /login?error=<code> when sign-in fails.
  const [searchParams] = useSearchParams();
  const googleError = searchParams.get('error');
  // Back to where login was required (e.g. the OAuth consent page).
  const next = safeNext(searchParams.get('next'));
  const [error, setError] = useState<string | null>(() =>
    googleError ? t(`errors.${googleError}`, { defaultValue: t('auth.login.genericError') }) : null,
  );
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate(next ?? '/');
    } catch (err) {
      setError(translateApiError(err, t, 'auth.login.genericError'));
    } finally {
      setBusy(false);
    }
  }

  // No credentials: a session for the shared demo account, a copy of real data.
  async function handleDemo() {
    setError(null);
    setBusy(true);
    try {
      await loginDemo();
      navigate('/');
    } catch (err) {
      setError(translateApiError(err, t, 'auth.login.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 pt-[env(safe-area-inset-top)]">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-3xl text-accent">MyGym</h1>
        <p className="mb-6 text-sm text-slate-400">{t('auth.login.subtitle')}</p>
        <GoogleSignInButton next={next} />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">{t('auth.login.email')}</label>
            <input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">{t('auth.login.password')}</label>
            <PasswordInput id="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t('auth.login.submitting') : t('auth.login.submit')}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          {t('auth.login.noAccount')}{' '}
          <Link to={next ? `/register?next=${encodeURIComponent(next)}` : '/register'} className="text-accent hover:underline">
            {t('auth.login.registerLink')}
          </Link>
        </p>
        {providersQuery.data?.demo && (
          <div className="mt-5 border-t border-surface-border pt-5 text-center">
            <button type="button" className="btn-secondary w-full" onClick={handleDemo} disabled={busy}>
              {t('demo.try')}
            </button>
            <p className="mt-2 text-xs text-slate-400">{t('demo.tryHint')}</p>
          </div>
        )}
        <p className="mt-3 text-center text-xs text-slate-400">
          <Link to="/privacy" className="hover:underline">
            {t('privacy.link')}
          </Link>
        </p>
      </div>
    </div>
  );
}
