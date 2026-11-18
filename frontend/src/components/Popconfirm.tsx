import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Keep in sync with the `pop-out` duration in tailwind.config.js — this is
// how long we keep the panel mounted so its exit animation can play out.
const CLOSE_ANIMATION_MS = 120;
// Space kept between the panel and whatever it must not run under.
const EDGE_GAP_PX = 8;

export default function Popconfirm({
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  onOpenChange,
  children,
}: {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  // Called when the panel opens and once it has finished closing - e.g. to
  // lift the trigger's wrapper above the next card while it's open.
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const resolvedConfirmText = confirmText ?? t('common.confirmDelete');
  const resolvedCancelText = cancelText ?? t('common.cancel');
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout>>();
  const panelRef = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);

  function close() {
    setClosing(true);
    clearTimeout(closeTimeout.current);
    closeTimeout.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      onOpenChange?.(false);
    }, CLOSE_ANIMATION_MS);
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    clearTimeout(closeTimeout.current);
    setClosing(false);
    setOpen(true);
    onOpenChange?.(true);
  }

  useEffect(() => {
    if (!open || closing) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open, closing]);

  useEffect(() => () => clearTimeout(closeTimeout.current), []);

  // Opens downward; if that runs under the phone's bottom nav or off the
  // screen (the last card on a page, even scrolled to the end), and there is
  // room above, it opens upward instead. Measured before paint, once per open.
  useLayoutEffect(() => {
    if (!open) {
      setAbove(false);
      return;
    }
    const panel = panelRef.current;
    const trigger = ref.current;
    if (!panel || !trigger) return;
    const nav = document.querySelector<HTMLElement>('[data-bottom-nav]');
    const navTop = nav && nav.clientWidth > 0 ? nav.getBoundingClientRect().top : window.innerHeight;
    const limit = Math.min(navTop, window.innerHeight) - EDGE_GAP_PX;
    // offsetHeight, not the rect: the pop-in animation is scaling it down right now.
    const height = panel.offsetHeight;
    const triggerRect = trigger.getBoundingClientRect();
    const fitsBelow = triggerRect.bottom + EDGE_GAP_PX + height <= limit;
    const fitsAbove = triggerRect.top - EDGE_GAP_PX - height >= EDGE_GAP_PX;
    setAbove(!fitsBelow && fitsAbove);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <span onClick={toggle}>{children}</span>

      {open && (
        <div
          ref={panelRef}
          className={`absolute right-0 z-20 ${above ? 'bottom-full mb-2 origin-bottom-right' : 'mt-2 origin-top-right'} w-64 rounded-lg border border-surface-border bg-surface-raised p-3 shadow-xl ${
            closing ? 'animate-pop-out' : 'animate-pop-in'
          }`}
        >
          <p className="text-sm font-medium text-slate-100">{title}</p>
          {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-ghost px-2 py-1 text-xs" onClick={close}>
              {resolvedCancelText}
            </button>
            <button
              className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20"
              onClick={() => {
                close();
                onConfirm();
              }}
            >
              {resolvedConfirmText}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
