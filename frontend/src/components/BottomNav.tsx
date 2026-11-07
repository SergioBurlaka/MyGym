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
// lg up): four sections plus "More", a sheet with the rest. A flat panel on the
// bottom edge: --bottom-nav-h (styles/index.css) is its height, the
// home-indicator inset comes on top - App.tsx pads <main> by the same amount
// and the program form's sticky bar leaves that much room (ProgramsPage.tsx).
// Design: docs/tasks/design/NavMobileA.dc.html (sheet, behaviour) and
// NavFlatSquare.dc.html (the panel and its tabs).

// The whole fifth of the panel is the tap target; the square inside shows state.
// Not outline-none: its transparent outline turns solid in forced colors, and it
// would frame every tab all the time.
const TAB_CLASS = 'group flex h-14 items-center justify-center focus:[outline:none]';

const SQUARE_CLASS =
  'flex h-11 w-11 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-[180ms] ease-in-out group-active:scale-[.92] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 motion-reduce:transition-none';

// The logo's shape: 44px / radius 12 is its 36px / radius 9. Inactive #7c8597 is
// 4.8:1 on `surface`, the dark icon 5.8:1 on accent. Focus rings land on the
// panel: accent 5.8:1, slate-100 16:1. --icon-bg is what JournalIcon's pencil is
// filled with: whatever is behind the icon. Forced colors drop the background and
// there is no visible label, so the active square gets the system's own pair.
function squareClass(active: boolean) {
  return `${SQUARE_CLASS} ${
    active
      ? 'bg-accent text-surface shadow-nav-active [--icon-bg:theme(colors.accent.DEFAULT)] group-focus-visible:outline-slate-100 forced-colors:bg-[color:Highlight] forced-colors:text-[color:HighlightText] forced-colors:[--icon-bg:Highlight] forced-colors:forced-color-adjust-none forced-colors:group-focus-visible:outline-[color:Highlight]'
      : 'text-[#7c8597] [--icon-bg:theme(colors.surface.DEFAULT)] group-focus-visible:outline-accent forced-colors:[--icon-bg:Canvas]'
  }`;
}

// The hidden label is the tab's accessible name (no aria-label).
function TabContent({ active, icon, label }: { active: boolean; icon: ReactNode; label: string }) {
  return (
    <>
      <span className={squareClass(active)}>{icon}</span>
      <span className="sr-only">{label}</span>
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
    { to: '/', end: true, label: t('nav.journal'), icon: <JournalIcon size={24} /> },
    { to: '/programs', end: false, label: t('nav.programs'), icon: <ProgramsIcon size={24} /> },
    { to: '/progress', end: false, label: t('nav.progress'), icon: <ProgressIcon size={24} /> },
    { to: '/exercises', end: false, label: t('nav.exercises'), icon: <ExercisesIcon size={24} /> },
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
          {/* Dims the page down to the panel: the tabs stay lit and usable. */}
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
        // Above the sheet while it's open: the sheet slides up from under the panel.
        className={`fixed inset-x-0 bottom-0 grid grid-cols-5 items-center border-t border-surface-border bg-surface pl-[max(8px,env(safe-area-inset-left))] pr-[max(8px,env(safe-area-inset-right))] lg:hidden ${
          moreOpen ? 'z-50' : 'z-30'
        }`}
        style={{
          height: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))',
          paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            // While the sheet is open "More" is the highlighted one.
            className={TAB_CLASS}
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
          className={TAB_CLASS}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <TabContent active={moreActive} icon={<MoreIcon size={24} />} label={t('nav.more')} />
        </button>
      </nav>
    </>
  );
}
