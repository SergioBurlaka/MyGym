import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';
import PasswordInput from '../components/PasswordInput.js';
import { translateApiError } from '../utils/apiError.js';

export default function RegisterPage() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(email, password);
      navigate('/');
    } catch (err) {
      setError(translateApiError(err, t, 'auth.register.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-3xl text-accent">MyGym</h1>
        <p className="mb-6 text-sm text-slate-400">{t('auth.register.subtitle')}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">{t('auth.register.email')}</label>
            <input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">{t('auth.register.password')}</label>
            <PasswordInput id="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t('auth.register.submitting') : t('auth.register.submit')}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="text-accent hover:underline">
            {t('auth.register.loginLink')}
          </Link>
        </p>
      </div>
    </div>
  );
}
