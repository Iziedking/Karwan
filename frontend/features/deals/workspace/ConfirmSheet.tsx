'use client';
import type { ReactNode } from 'react';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export function ConfirmSheet({ open, title, consequence, irreversible, busy, error, onConfirm, onClose, children }: {
  open: boolean;
  title: string;
  consequence: string;
  irreversible: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const copy = useTranslations().dealWorkspace.confirm;
  return (
    <ConfirmSheetShell open={open} labelledBy="confirm-title" busy={busy} onClose={onClose}>
      <h2 id="confirm-title" className="text-[20px] font-semibold text-[var(--lp-dark)]">{title}</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-dark)]">{consequence}</p>
      {irreversible ? <p className="mt-2 text-[14px] font-medium text-[var(--color-warning)]">{copy.cannotUndo}</p> : null}
      {children ? <div className="mt-5">{children}</div> : null}
      {error ? (
        <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{error}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button" onClick={onConfirm} disabled={busy}
          className="inline-flex min-h-12 items-center rounded-[10px] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        >
          {busy ? copy.working : copy.confirm}
        </button>
        <button
          type="button" onClick={onClose} disabled={busy}
          className="inline-flex min-h-12 items-center rounded-[10px] border border-[var(--lp-outline-strong)] px-5 text-[15px] font-medium text-[var(--lp-dark)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {copy.cancel}
        </button>
      </div>
    </ConfirmSheetShell>
  );
}
