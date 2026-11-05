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
// lg up): four sections plus "More", a sheet with the rest. A floating dock:
// --bottom-nav-h (styles/index.css) is its height plus the gap under it, the
// home-indicator inset comes on top - App.tsx pads <main> by the same amount
// and the program form's sticky bar leaves that much room (ProgramsPage.tsx).
// Design: docs/tasks/design/NavMobileA.dc.html (sheet, behaviour) and
// NavDock.dc.html (the dock).

// Each tab is 48px tall and at least 48px wide; justify-between on the dock
// takes up what the active pill's width leaves.
const TAB_CLASS =
  'group flex h-12 min-w-12 items-center justify-center rounded-3xl transition-[background-color,color,padding] duration-[220ms] ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none';

// Inactive slate-400 is over 6:1 on the dock; the pill's dark text 5.8:1 on
// accent. --icon-bg is what JournalIcon's pencil is filled with. Padding, not
// width: a width can't animate to auto. Under 379px the pill's padding tightens:
// the widest label ("Програми", 71px) would be cut otherwise.
function tabClass(active: boolean) {
  return `${TAB_CLASS} ${
    active
      ? 'bg-accent pl-3.5 pr-[18px] text-surface max-[378px]:pl-3 max-[378px]:pr-3.5 [--icon-bg:theme(colors.accent.DEFAULT)] focus-visible:outline-slate-100'
      : 'shrink-0 px-[13px] text-slate-400 [--icon-bg:theme(colors.surface.raised)] focus-visible:outline-accent'
  }`;
}

// The label is always there and is the tab's accessible name (no aria-label):
// an inactive tab only squeezes it to nothing, which also lets it animate open.
// `shortLabel` replaces it on screen, not for screen readers - "More" stays
// named like its sheet.
function TabContent({
  active,
  icon,
  label,
  shortLabel,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  shortLabel?: string;
}) {
  return (
    <>
      <span className="flex shrink-0 transition-transform duration-[220ms] group-active:scale-[.92] motion-reduce:transition-none">
        {icon}
      </span>
      <span
        aria-hidden={shortLabel ? true : undefined}
        className={`min-w-0 truncate text-sm font-semibold transition-[max-width,margin,opacity] duration-[220ms] ease-in-out motion-reduce:transition-none ${
          active ? 'ml-2 max-w-[7rem] opacity-100' : 'ml-0 max-w-0 opacity-0'
        }`}
      >
        {shortLabel ?? label}
      </span>
      {shortLabel && <span className="sr-only">{label}</span>}
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
  const moreActive = moreOpen || moreItems.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

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
          {/* Dims the whole page, round the dock too; the dock rises above it
              while the sheet is open, so the tabs stay usable. */}
          <div
            className="fixed inset-0 z-40 animate-fade-in bg-black/45 motion-reduce:animate-none lg:hidden"
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
        // Under 375px the widest pill and four 48px tabs also need the narrower
        // margins - tabs stay 48px rather than shrink.
        className={`fixed left-[max(16px,env(safe-area-inset-left))] right-[max(16px,env(safe-area-inset-right))] flex h-[68px] items-center justify-between rounded-[34px] border border-surface-border bg-surface-raised/[.94] px-2.5 shadow-[0_14px_36px_rgba(0,0,0,0.55)] backdrop-blur-[16px] max-[374px]:left-[max(12px,env(safe-area-inset-left))] max-[374px]:right-[max(12px,env(safe-area-inset-right))] max-[374px]:px-1.5 lg:hidden ${
          moreOpen ? 'z-50' : 'z-30'
        }`}
        style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            // While the sheet is open "More" is the highlighted one.
            className={({ isActive }) => tabClass(isActive && !moreOpen)}
            onClick={() => setMoreOpen(false)}
          >
            {({ isActive }) => <TabContent active={isActive && !moreOpen} icon={tab.icon} label={tab.label} />}
          </NavLink>
        ))}
        <button
          ref={moreButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={tabClass(moreActive)}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <TabContent active={moreActive} icon={<MoreIcon />} label={t('nav.more')} shortLabel={t('nav.moreShort')} />
        </button>
      </nav>
    </>
  );
}
