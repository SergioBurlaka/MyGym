import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';
import LanguageSwitcher from './LanguageSwitcher.js';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
    isActive ? 'bg-accent text-white' : 'text-slate-300 hover:text-white hover:bg-surface-raised'
  }`;

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
    isActive ? 'bg-accent text-white' : 'text-slate-300 hover:text-white hover:bg-surface-raised'
  }`;

export default function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const NAV_ITEMS = [
    { to: '/', end: true, label: t('nav.journal') },
    { to: '/programs', end: false, label: t('nav.programs') },
    { to: '/progress', end: false, label: t('nav.progress') },
    { to: '/exercises', end: false, label: t('nav.exercises') },
    { to: '/import', end: false, label: t('nav.import') },
  ];

  useEffect(() => {
    if (!mobileOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setMobileOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [mobileOpen]);

  if (!user) return null;

  async function handleLogout() {
    setMobileOpen(false);
    await logout();
    navigate('/login');
  }

  return (
    <header ref={headerRef} className="sticky top-0 z-10 border-b border-surface-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-display text-2xl tracking-wider text-accent">MyGym</span>
          </span>
          <nav className="hidden gap-1 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <LanguageSwitcher />
          <span className="text-sm text-slate-400">{user.email}</span>
          <button className="btn-ghost" onClick={handleLogout}>
            {t('nav.logout')}
          </button>
        </div>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-200 hover:bg-surface-raised sm:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-expanded={mobileOpen}
        >
          <span className="relative block h-4 w-6">
            <span
              className={`absolute left-0 h-0.5 w-6 rounded-full bg-current transition-all duration-300 ease-in-out ${
                mobileOpen ? 'top-1.5 rotate-45' : 'top-0'
              }`}
            />
            <span
              className={`absolute left-0 top-1.5 h-0.5 w-6 rounded-full bg-current transition-opacity duration-200 ${
                mobileOpen ? 'opacity-0' : 'opacity-100'
              }`}
            />
            <span
              className={`absolute left-0 h-0.5 w-6 rounded-full bg-current transition-all duration-300 ease-in-out ${
                mobileOpen ? 'top-1.5 -rotate-45' : 'top-3'
              }`}
            />
          </span>
        </button>
      </div>

      {mobileOpen && (
        <nav className="space-y-1 border-t border-surface-border px-4 py-3 sm:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={mobileLinkClass}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-surface-border pt-3">
            <span className="text-sm text-slate-400">{user.email}</span>
            <button className="btn-ghost" onClick={handleLogout}>
              {t('nav.logout')}
            </button>
          </div>
          <div className="border-t border-surface-border pt-3">
            <LanguageSwitcher />
          </div>
        </nav>
      )}
    </header>
  );
}
