import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
import { navWavePositions } from '../utils/navWave.js';

// The phone's main navigation (below lg; the header links take over from
// lg up): four sections plus "More", a sheet with the rest. A capsule floating
// PANEL_GAP above the bottom edge: --bottom-nav-h (styles/index.css) is its height
// plus that gap, the home-indicator inset comes on top - App.tsx pads <main> by the
// same amount and the program form's sticky bar leaves that much room (ProgramsPage.tsx).
// Design: docs/tasks/design/NavMobileA.dc.html (sheet, behaviour) and
// NavFloatingRounded.dc.html (the panel), NavRoundedPanel.dc.html (its tabs),
// NavNeonWave.dc.html (the accent border, glow and wave).

// Below the panel, part of --bottom-nav-h. The same 6px on the sides is in its classes.
const PANEL_GAP = '6px';

// The whole fifth of the panel is the tap target; the square inside shows state.
// Not outline-none: its transparent outline turns solid in forced colors, and it
// would frame every tab all the time. Positioned so it paints over the wave.
const TAB_CLASS = 'group relative flex h-14 items-center justify-center focus:[outline:none]';

// The wave slides after the first placement only; the glow 30ms longer, a slight trail.
const WAVE_EASE = 'ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none';
const WAVE_LINE_MOTION = `transition-[transform,opacity] duration-[420ms] ${WAVE_EASE}`;
const WAVE_GLOW_MOTION = `transition-[transform,opacity] duration-[450ms] ${WAVE_EASE}`;

const SQUARE_CLASS =
  'flex h-11 w-11 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-[180ms] ease-in-out group-active:scale-[.92] group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 motion-reduce:transition-none';

// The logo's shape: 44px / radius 12 is its 36px / radius 9. Inactive #7c8597 is
// 4.8:1 on `surface`. The active icon is pure white, 3.1:1 on accent: slate-100
// is 2.8:1, under the 3:1 an icon needs. Focus rings land on the
// panel: accent 5.8:1, slate-100 16:1. --icon-bg is what JournalIcon's pencil is
// filled with: whatever is behind the icon. Forced colors drop the background and
// there is no visible label, so the active square gets the system's own pair.
function squareClass(active: boolean) {
  return `${SQUARE_CLASS} ${
    active
      ? 'bg-accent text-white shadow-nav-active [--icon-bg:theme(colors.accent.DEFAULT)] group-focus-visible:outline-slate-100 forced-colors:bg-[color:Highlight] forced-colors:text-[color:HighlightText] forced-colors:[--icon-bg:Highlight] forced-colors:forced-color-adjust-none forced-colors:group-focus-visible:outline-[color:Highlight]'
      : 'text-[#7c8597] [--icon-bg:theme(colors.surface.DEFAULT)] group-focus-visible:outline-accent forced-colors:[--icon-bg:Canvas]'
  }`;
}

// The hidden label is the tab's accessible name (no aria-label). data-nav-active
// marks the highlighted square: the wave goes to the cell holding it.
function TabContent({ active, icon, label }: { active: boolean; icon: ReactNode; label: string }) {
  return (
    <>
      <span className={squareClass(active)} data-nav-active={active || undefined}>
        {icon}
      </span>
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
  const navRef = useRef<HTMLElement>(null);
  const [waveMoves, setWaveMoves] = useState(false);

  const tabs = [
    { to: '/', end: true, label: t('nav.journal'), icon: <JournalIcon size={26} /> },
    { to: '/programs', end: false, label: t('nav.programs'), icon: <ProgramsIcon size={26} /> },
    { to: '/progress', end: false, label: t('nav.progress'), icon: <ProgressIcon size={26} /> },
    { to: '/exercises', end: false, label: t('nav.exercises'), icon: <ExercisesIcon size={26} /> },
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

  // The wave sits over the highlighted square's cell, measured from the DOM: it
  // follows whatever squareClass highlights, "More" included. With nothing
  // highlighted (a workout, 404) it fades out where it was. Set as variables on
  // the panel, before paint; the first placement doesn't animate - the
  // transitions come on a frame after it. Neither does a resize: it jumps.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let frame = 0;
    function place(nav: HTMLElement) {
      // Hidden on lg+ (display: none) - nothing to measure; placed when it shows.
      if (!nav.clientWidth) return;
      const cell = nav.querySelector('[data-nav-active]')?.parentElement;
      if (!cell) {
        nav.style.setProperty('--wave-o', '0');
        return;
      }
      const { waveX, glowX } = navWavePositions(cell.offsetLeft + cell.offsetWidth / 2, nav.clientWidth);
      nav.style.setProperty('--wave-x', `${waveX}px`);
      nav.style.setProperty('--glow-x', `${glowX}px`);
      nav.style.setProperty('--wave-o', '1');
      if (!waveMoves && !frame) frame = requestAnimationFrame(() => setWaveMoves(true));
    }
    place(nav);
    // Rotation, a safe-area change, a new width, coming back below lg: in place
    // at once, not sliding there. Not its first call: observe() fires one right
    // away, after place() above - it would cut the tab switch's slide short.
    let initial = true;
    const observer = new ResizeObserver(() => {
      if (initial) {
        initial = false;
        return;
      }
      const layers = nav.querySelectorAll<HTMLElement>('.nav-wave-line, .nav-wave-glow');
      layers.forEach((layer) => (layer.style.transition = 'none'));
      place(nav);
      void nav.offsetWidth; // commit the jump before the transition comes back
      layers.forEach((layer) => (layer.style.transition = ''));
    });
    observer.observe(nav);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [user, pathname, moreActive, waveMoves]);

  if (!user) return null;

  return (
    <>
      {moreOpen && (
        <>
          {/* Dims the whole screen, so the gaps around the panel go dark too; the panel
              is above it, its tabs stay lit and usable. */}
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
        ref={navRef}
        aria-label={t('nav.mainNav')}
        // Above the dimming while the sheet is open: the tabs stay lit and usable.
        className={`fixed left-[max(6px,env(safe-area-inset-left))] right-[max(6px,env(safe-area-inset-right))] grid grid-cols-5 items-center rounded-[24px] border border-accent/80 bg-surface px-1.5 py-1 lg:hidden ${
          moreOpen ? 'z-50 shadow-nav-panel-open' : 'z-30 shadow-nav-panel'
        }`}
        style={{
          bottom: `calc(${PANEL_GAP} + env(safe-area-inset-bottom))`,
          height: `calc(var(--bottom-nav-h) - ${PANEL_GAP})`,
        }}
      >
        {/* Decorative, under the tabs: no focus, no name. Not in forced colors -
            noise there, the Highlight square already shows the tab. */}
        <span aria-hidden className={`nav-wave-glow forced-colors:hidden ${waveMoves ? WAVE_GLOW_MOTION : ''}`} />
        <span aria-hidden className={`nav-wave-line forced-colors:hidden ${waveMoves ? WAVE_LINE_MOTION : ''}`} />
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
          <TabContent active={moreActive} icon={<MoreIcon size={26} />} label={t('nav.more')} />
        </button>
      </nav>
    </>
  );
}
