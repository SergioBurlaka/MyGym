import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';
import {
  ChevronRightIcon,
  CloseIcon,
  ExercisesIcon,
  ImportIcon,
  IntegrationsIcon,
  JournalIcon,
  MoreIcon,
  ProgramsIcon,
  ProgressIcon,
  ScheduleIcon,
} from './NavIcons.js';

// The phone's main navigation (below lg; the header links take over from
// lg up): four sections plus "More", a sheet with the rest. The bar is
// --bottom-nav-h (styles/index.css) + the home-indicator inset - App.tsx pads <main> by the same amount
// and the program form's sticky bar sits on top of it (ProgramsPage.tsx).
// Design: docs/tasks/design/NavMobileA.dc.html (sheet, behaviour) and
// NavBarC.dc.html (the bar: a top line and a label under every icon).

// The whole fifth of the bar is the tap target; the visible label is the
// accessible name (no aria-label / title).
const TAB_CLASS =
  'group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent';

// Inactive #8b93a3 is 5.8:1 on the bar (surface), accent 5.8:1.
function TabContent({ active, icon, label }: { active: boolean; icon: ReactNode; label: string }) {
  const colour = active ? 'text-accent' : 'text-[#8b93a3]';
  return (
    <>
      {/* The indicator line sits on the bar's top border. */}
      <span
        aria-hidden
        className={`absolute left-1/2 top-[-1px] h-[3px] w-7 -translate-x-1/2 rounded-b-[3px] bg-accent transition-opacity duration-[180ms] motion-reduce:transition-none ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <span className={`flex transition-[color,transform] duration-[180ms] group-active:scale-[.92] motion-reduce:transition-none ${colour}`}>
        {icon}
      </span>
      <span className={`max-w-full truncate px-0.5 text-[11px] font-semibold leading-tight transition-colors duration-[180ms] motion-reduce:transition-none ${colour}`}>
        {label}
      </span>
    </>
  );
}

export default function BottomNav() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const tabs = [
    { to: '/', end: true, label: t('nav.journal'), icon: <JournalIcon /> },
    { to: '/programs', end: false, label: t('nav.programs'), icon: <ProgramsIcon /> },
    { to: '/progress', end: false, label: t('nav.progress'), icon: <ProgressIcon /> },
    { to: '/exercises', end: false, label: t('nav.exercises'), icon: <ExercisesIcon /> },
  ];
  const moreItems = [
    { to: '/schedule', label: t('nav.schedule'), icon: <ScheduleIcon /> },
    { to: '/import', label: t('nav.import'), icon: <ImportIcon /> },
    // Tokens and connected apps are off for the shared demo account.
    ...(user?.isDemo ? [] : [{ to: '/integrations', label: t('nav.integrations'), icon: <IntegrationsIcon /> }]),
  ];
  const onMoreRoute = moreItems.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

  function closeMore(returnFocus: boolean) {
    setMoreOpen(false);
    if (returnFocus) moreButtonRef.current?.focus();
  }

  // Any navigation (a row, a tab, the header timer) closes the sheet.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    sheetRef.current?.querySelector<HTMLElement>('a')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMore(true);
    }
    // Widened to lg the sheet is hidden (lg:hidden) - close it, or it would
    // come back open when the window narrows again.
    const desktop = window.matchMedia('(min-width: 1024px)');
    function onDesktop(e: MediaQueryListEvent) {
      if (e.matches) setMoreOpen(false);
    }
    document.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onDesktop);
    return () => {
      document.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', onDesktop);
    };
  }, [moreOpen]);

  if (!user) return null;

  return (
    <>
      {moreOpen && (
        <>
          {/* Dims the page, not the bar - the tabs stay usable. */}
          <div
            className="fixed inset-x-0 top-0 z-40 animate-fade-in bg-black/45 motion-reduce:animate-none lg:hidden"
            style={{ bottom: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))' }}
            aria-hidden
            onClick={() => closeMore(false)}
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-label={t('nav.more')}
            className="fixed left-2 right-2 z-40 animate-sheet-up rounded-[18px] border border-[#2f3542] bg-surface-raised px-3 pb-2.5 pt-3.5 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] motion-reduce:animate-none lg:hidden"
            style={{ bottom: 'calc(var(--bottom-nav-h) + 8px + env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center px-1 pb-2">
              <h2 className="flex-1 text-base font-bold text-slate-100">{t('nav.more')}</h2>
              <button
                type="button"
                className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-[#9aa2b1] hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => closeMore(true)}
                aria-label={t('common.close')}
              >
                <CloseIcon size={20} />
              </button>
            </div>
            {moreItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex h-[52px] items-center gap-3.5 rounded-xl px-2.5 text-[15px] text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                    isActive ? 'bg-accent/10' : 'hover:bg-surface-border'
                  }`
                }
                onClick={() => setMoreOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-accent' : 'text-[#9aa2b1]'}>{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[#5a6272]">
                      <ChevronRightIcon />
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </>
      )}

      <nav
        aria-label={t('nav.mainNav')}
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-surface-border bg-surface pl-[max(6px,env(safe-area-inset-left))] pr-[max(6px,env(safe-area-inset-right))] lg:hidden"
        style={{ height: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))', paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={TAB_CLASS}
            onClick={() => setMoreOpen(false)}
          >
            {/* While the sheet is open "More" is the highlighted one. */}
            {({ isActive }) => <TabContent active={isActive && !moreOpen} icon={tab.icon} label={tab.label} />}
          </NavLink>
        ))}
        <button
          ref={moreButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={TAB_CLASS}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <TabContent active={moreOpen || onMoreRoute} icon={<MoreIcon />} label={t('nav.more')} />
        </button>
      </nav>
    </>
  );
}
