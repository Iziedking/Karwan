'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Button } from '@/shared/components/Button';

export function ConfirmSheet({ open, title, consequence, irreversible, busy, error, onConfirm, onClose, children, confirmVariant = 'primary', confirmLabel }: {
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
  /// What the button does, in words. Defaults to the generic Confirm.
  confirmLabel?: string;
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
      <h2 id="confirm-title" className="text-[19px] font-semibold leading-[1.3] tracking-[-0.01em] text-[var(--ink)]">{title}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{consequence}</p>
      {irreversible ? <p className="mt-1.5 text-[15px] text-[var(--ink-secondary)]">{copy.cannotUndo}</p> : null}
      {children ? <div className="mt-5">{children}</div> : null}
      {error ? (
        <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--ink)]">{error}</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-2">
        <Button
          ref={confirmRef}
          type="button"
          onClick={onConfirm}
          loading={busy}
          loadingLabel={copy.working}
          data-testid="deal-confirm"
          variant={confirmVariant === 'secondary' ? 'secondary' : 'primary'}
          size="lg"
          className="w-full"
        >
          {confirmLabel ?? copy.confirm}
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={busy} className="w-full">
          {copy.cancel}
        </Button>
      </div>
    </ConfirmSheetShell>
  );
}
