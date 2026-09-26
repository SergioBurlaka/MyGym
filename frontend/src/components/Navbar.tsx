import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';
import LanguageSwitcher from './LanguageSwitcher.js';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 px-1 py-2 text-sm font-semibold transition-colors ${
    isActive ? 'border-accent text-white' : 'border-transparent text-slate-400 hover:text-white'
  }`;

// First letter of each of the first two dot/underscore/dash/digit-separated
// segments of the email's local part (e.g. "j.connor@..." -> "JC") - falls
// back to the first two letters when there's only one segment.
function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const segments = local.split(/[^a-zA-Z]+/).filter(Boolean);
  if (segments.length >= 2) return (segments[0][0] + segments[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

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
            <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-lg" />
            <span className="font-sans text-xl font-bold tracking-tight text-slate-100">
              My<span className="font-extrabold text-accent">Gym</span>
            </span>
          </span>
          <nav className="hidden gap-6 sm:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <LanguageSwitcher />
          <ProfileMenu email={user.email} onLogout={handleLogout} />
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

      <nav
        className={`absolute inset-x-0 top-full grid bg-surface/95 shadow-xl backdrop-blur transition-[grid-template-rows,opacity] duration-300 ease-in-out sm:hidden ${
          mobileOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        {/* min-h-0 lets this grid row actually shrink to 0 instead of clamping
            to the content's height - without it grid-rows-[0fr] has no effect. */}
        <div className="min-h-0 overflow-hidden">
          <div className={`space-y-1 border-t px-4 py-3 ${mobileOpen ? 'border-surface-border' : 'border-transparent'}`}>
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
          </div>
        </div>
      </nav>
    </header>
  );
}

function ProfileMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
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
        type="button"
        className="flex items-center gap-1.5 rounded-lg p-1 text-slate-400 hover:text-white"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
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
