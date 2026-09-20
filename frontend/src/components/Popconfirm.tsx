import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Keep in sync with the `pop-out` duration in tailwind.config.js — this is
// how long we keep the panel mounted so its exit animation can play out.
const CLOSE_ANIMATION_MS = 120;

export default function Popconfirm({
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  children,
}: {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const resolvedConfirmText = confirmText ?? t('common.confirmDelete');
  const resolvedCancelText = cancelText ?? t('common.cancel');
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimeout = useRef<ReturnType<typeof setTimeout>>();

  function close() {
    setClosing(true);
    clearTimeout(closeTimeout.current);
    closeTimeout.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
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

  return (
    <div className="relative inline-block" ref={ref}>
      <span onClick={toggle}>{children}</span>

      {open && (
        <div
          className={`absolute right-0 z-20 mt-2 w-64 origin-top-right rounded-lg border border-surface-border bg-surface-raised p-3 shadow-xl ${
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
