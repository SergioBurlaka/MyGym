import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher.js';
import { CloseIcon, GlobeIcon, LogoutIcon } from './NavIcons.js';
import { initials } from '../utils/initials.js';

// The phone's account menu (below lg; the desktop has ProfileMenu in
// Navbar.tsx): the avatar in the header opens a card with the email, the
// language and logging out. Schedule and integrations live in the bottom
// bar's "More" sheet here. Design: docs/tasks/design/NavMobileA.dc.html.
//
// It's a dialog, not role="menu": a menu may hold only menu items, and this
// one holds the language buttons too.
//
// Portalled into <body>: the header is sticky with backdrop-blur - its own
// stacking context and the containing block of fixed children - so a scrim
// inside it would cover only the header, and anything outside the header
// (the bottom bar) would paint over the card.
export default function AccountMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    // Right under the avatar - the header's height varies with the
    // safe-area inset of an installed PWA.
    setTop((buttonRef.current?.getBoundingClientRect().bottom ?? 60) + 8);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    // The card is placed once, under the avatar: rotating the phone would
    // leave it floating, so it closes instead.
    function onResize() {
      setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-slate-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          open ? 'bg-[#3a4150]' : 'bg-surface-border'
        }`}
        onClick={() => (open ? close() : openMenu())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('nav.account')}
      >
        {initials(email)}
      </button>

      {open &&
        createPortal(
          <>
            {/* Swallows the outside tap - a document mousedown listener let the
                same tap's click land on the page underneath. */}
            <div
              className="fixed inset-0 z-40 animate-fade-in bg-black/35 motion-reduce:animate-none lg:hidden"
              aria-hidden
              onClick={close}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-label={t('nav.account')}
              className="fixed right-3 z-40 flex w-[300px] max-w-[calc(100vw-1.5rem)] origin-top-right animate-menu-pop flex-col rounded-2xl border border-[#2f3542] bg-surface-raised px-4 pb-2.5 pt-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)] motion-reduce:animate-none lg:hidden"
              style={{ top }}
            >
              <div className="flex items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs text-hint">{t('nav.account')}</span>
                  <b className="truncate text-sm text-slate-100">{email}</b>
                </div>
                <button
                  type="button"
                  className="-mr-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#9aa2b1] hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={close}
                  aria-label={t('common.close')}
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="mt-[18px] flex items-center gap-2.5">
                <span className="flex text-[#9aa2b1]">
                  <GlobeIcon />
                </span>
                <span className="flex-1 text-sm text-slate-100">{t('nav.languageShort')}</span>
                <LanguageSwitcher size="large" />
              </div>

              <div className="-mx-1 mb-1.5 mt-3.5 h-px bg-surface-border" />

              <button
                type="button"
                className="-mx-1.5 flex h-11 items-center gap-2.5 rounded-[10px] px-1.5 text-left text-sm text-slate-100 hover:bg-surface-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                <span className="flex text-[#9aa2b1]">
                  <LogoutIcon />
                </span>
                {t('nav.logoutLong')}
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
