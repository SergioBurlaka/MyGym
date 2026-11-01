import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';
import LanguageSwitcher from './LanguageSwitcher.js';
import WorkoutTimer from './WorkoutTimer.js';
import AccountMenu from './AccountMenu.js';
import { initials } from '../utils/initials.js';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 px-1 py-2 text-sm font-semibold transition-colors ${
    isActive ? 'border-accent text-white' : 'border-transparent text-slate-400 hover:text-white'
  }`;

export default function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const NAV_ITEMS = [
    { to: '/', end: true, label: t('nav.journal') },
    { to: '/programs', end: false, label: t('nav.programs') },
    { to: '/progress', end: false, label: t('nav.progress') },
    { to: '/exercises', end: false, label: t('nav.exercises') },
    { to: '/import', end: false, label: t('nav.import') },
  ];

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  // pt-safe-area: in the installed (standalone) PWA the page runs under the
  // status bar / camera cutout (viewport-fit=cover); 0 in a normal tab.
  return (
    <header
      className="sticky top-0 z-10 border-b border-surface-border bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:gap-4">
        <div className="flex items-center gap-6">
          {/* Icon + wordmark lockup from the design, text outlined as paths
              (an <img> SVG can't load the Barlow Condensed webfont). */}
          <img src="/logo.svg" alt="MyGym" className="h-9 w-auto" />
          <nav className="hidden gap-6 lg:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Centred between the logo and the avatar on a phone, next to the
            language switcher on wider screens. The header links start at lg:
            below 1024 px the five links plus the timer don't fit. */}
        <div className="flex min-w-0 flex-1 justify-center lg:justify-end">
          <WorkoutTimer />
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher />
          <ProfileMenu email={user.email} isDemo={user.isDemo} onLogout={handleLogout} />
        </div>

        {/* Below lg: the account menu; the sections are in the bottom bar (BottomNav). */}
        <div className="lg:hidden">
          <AccountMenu email={user.email} onLogout={handleLogout} />
        </div>
      </div>
    </header>
  );
}

function ProfileMenu({ email, isDemo, onLogout }: { email: string; isDemo: boolean; onLogout: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const focusInside = ref.current?.contains(document.activeElement);
      setOpen(false);
      if (focusInside) buttonRef.current?.focus();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="flex items-center gap-1.5 rounded-lg p-1 text-slate-400 hover:text-white"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('nav.profileMenu')}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-border text-sm font-bold text-slate-100">
          {initials(email)}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 animate-pop-in rounded-lg border border-surface-border bg-surface-raised p-2 shadow-xl">
          <p className="truncate px-2 py-1.5 text-sm text-slate-400">{email}</p>
          <Link
            to="/schedule"
            className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-surface-border"
            onClick={() => setOpen(false)}
          >
            {t('nav.schedule')}
          </Link>
          {!isDemo && (
            <Link
              to="/integrations"
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-surface-border"
              onClick={() => setOpen(false)}
            >
              {t('nav.integrations')}
            </Link>
          )}
          <button
            className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-surface-border"
            onClick={onLogout}
          >
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
