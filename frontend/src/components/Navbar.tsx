import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
    isActive ? 'bg-accent text-white' : 'text-slate-300 hover:text-white hover:bg-surface-raised'
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="sticky top-0 z-10 border-b border-surface-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-display text-2xl tracking-wider text-accent">MyGym</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={linkClass}>
              Журнал
            </NavLink>
            <NavLink to="/progress" className={linkClass}>
              Прогрес
            </NavLink>
            <NavLink to="/exercises" className={linkClass}>
              Вправи
            </NavLink>
            <NavLink to="/import" className={linkClass}>
              Імпорт
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-400 sm:inline">{user.email}</span>
          <button
            className="btn-ghost"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Вийти
          </button>
        </div>
      </div>
    </header>
  );
}
