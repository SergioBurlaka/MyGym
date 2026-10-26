import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';
import LanguageSwitcher from './LanguageSwitcher.js';
import WorkoutTimer from './WorkoutTimer.js';

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
    isActive ? 'bg-accent text-surface' : 'text-slate-300 hover:text-white hover:bg-surface-raised'
  }`;

export default function Navbar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NAV_ITEMS = [
    { to: '/', end: true, label: t('nav.journal') },
    { to: '/programs', end: false, label: t('nav.programs') },
    { to: '/progress', end: false, label: t('nav.progress') },
    { to: '/exercises', end: false, label: t('nav.exercises') },
    { to: '/import', end: false, label: t('nav.import') },
  ];

  // Outside taps are caught by the backdrop below, not a document listener:
  // closing on mousedown let the same tap's click land on the page underneath
  // (tapping the journal opened a workout instead of just closing the menu).
  useEffect(() => {
    if (!mobileOpen) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [mobileOpen]);

  if (!user) return null;

  async function handleLogout() {
    setMobileOpen(false);
    await logout();
    navigate('/login');
  }

  return (
    <>
    {/* Swallows the outside tap that closes the mobile menu. Lives outside the
        header: its backdrop-blur makes it the containing block for fixed
        children, so a fixed overlay inside would cover only the header. */}
    {mobileOpen && (
      <div className="fixed inset-0 z-10 lg:hidden" aria-hidden onClick={() => setMobileOpen(false)} />
    )}
    {/* pt-safe-area: in the installed (standalone) PWA the page runs under the
        status bar / camera cutout (viewport-fit=cover); 0 in a normal tab. */}
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

        {/* Centred between the logo and the burger on a phone, next to the
            language switcher on wider screens. The burger layout runs up to
            lg: below 1024 px the five links plus the timer don't fit. */}
        <div className="flex min-w-0 flex-1 justify-center lg:justify-end">
          <WorkoutTimer />
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher />
          <ProfileMenu email={user.email} onLogout={handleLogout} />
        </div>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-200 hover:bg-surface-raised lg:hidden"
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
        className={`absolute inset-x-0 top-full grid bg-surface/95 shadow-xl backdrop-blur transition-[grid-template-rows,opacity] duration-300 ease-in-out lg:hidden ${
          mobileOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        // Collapsed, the menu stays in the DOM for the animation - inert keeps
        // its invisible links (Log out included) out of the Tab order.
        inert={mobileOpen ? undefined : ''}
        aria-hidden={!mobileOpen}
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
            <NavLink to="/schedule" className={mobileLinkClass} onClick={() => setMobileOpen(false)}>
              {t('nav.schedule')}
            </NavLink>
            <NavLink to="/integrations" className={mobileLinkClass} onClick={() => setMobileOpen(false)}>
              {t('nav.integrations')}
            </NavLink>
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
    </>
  );
}

function ProfileMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
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
          <Link
            to="/integrations"
            className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-surface-border"
            onClick={() => setOpen(false)}
          >
            {t('nav.integrations')}
          </Link>
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
