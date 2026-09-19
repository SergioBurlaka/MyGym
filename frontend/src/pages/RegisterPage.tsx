import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

export default function RegisterPage() {
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
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Не вдалося зареєструватись');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-3xl text-accent">MyGym</h1>
        <p className="mb-6 text-sm text-slate-400">
          Створіть акаунт — одразу отримаєте 13 базових вправ у списку
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Пароль (мінімум 8 символів)</label>
            <input id="password" type="password" className="input" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Реєструємо…' : 'Зареєструватись'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          Вже є акаунт?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Увійти
          </Link>
        </p>
      </div>
    </div>
  );
}
