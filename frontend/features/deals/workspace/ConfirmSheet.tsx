'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export function ConfirmSheet({ open, title, consequence, irreversible, busy, error, onConfirm, onClose, children, confirmVariant = 'primary' }: {
  open: boolean;
  title: string;
  consequence: string;
  irreversible: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
  confirmVariant?: 'primary' | 'secondary';
}) {
  const copy = useTranslations().dealWorkspace.confirm;
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousVariant = useRef(confirmVariant);
  const restoreConfirmFocus = useRef(false);

  useEffect(() => {
    if (previousVariant.current === 'secondary' && confirmVariant === 'primary') {
      restoreConfirmFocus.current = true;
    }
    previousVariant.current = confirmVariant;
    if (!open) restoreConfirmFocus.current = false;
    else if (!busy && restoreConfirmFocus.current) {
      restoreConfirmFocus.current = false;
      confirmRef.current?.focus();
    }
  }, [busy, confirmVariant, open]);
  return (
    <ConfirmSheetShell open={open} labelledBy="confirm-title" busy={busy} onClose={onClose}>
      <h2 id="confirm-title" className="text-[20px] font-medium text-[var(--lp-dark)]">{title}</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-dark)]">{consequence}</p>
      {irreversible ? <p className="mt-2 text-[14px] font-medium text-[var(--color-warning)]">{copy.cannotUndo}</p> : null}
      {children ? <div className="mt-5">{children}</div> : null}
      {error ? (
        <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{error}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          ref={confirmRef}
          type="button" onClick={onConfirm} disabled={busy}
          data-testid="deal-confirm"
          className={confirmVariant === 'secondary'
            ? 'inline-flex min-h-12 items-center rounded-full bg-[var(--tint)] px-5 text-[15px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]'
            : 'inline-flex min-h-12 items-center rounded-full bg-[var(--action)] px-5 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]'}
        >
          {busy ? copy.working : copy.confirm}
        </button>
        <button
          type="button" onClick={onClose} disabled={busy}
          className="inline-flex min-h-12 items-center rounded-full bg-[var(--tint)] px-5 text-[15px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:bg-[var(--line)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
        >
          {copy.cancel}
        </button>
      </div>
    </ConfirmSheetShell>
  );
}
