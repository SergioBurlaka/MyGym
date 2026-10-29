import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// A destructive confirmation not tied to a button on screen (Popconfirm
// anchors to its trigger): a long-pressed set cell, a menu item that closes
// as it opens this. A bottom sheet on a phone, centred on a wide screen.
// Focus starts on Cancel - the safe choice - and returns where it was.
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Parents pass inline callbacks - keep the effect from re-running on each render.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const returnFocusTo = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusTo?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-sm animate-pop-in rounded-xl border border-surface-border bg-surface-raised p-4 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-100">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-1 text-sm text-slate-400">
            {description}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button ref={cancelRef} type="button" className="btn-secondary min-h-11 flex-1" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn min-h-11 flex-1 bg-red-500/15 text-red-400 hover:bg-red-500/25"
            onClick={onConfirm}
          >
            {confirmText ?? t('common.confirmDelete')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
