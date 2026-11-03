'use client';
import type { ReactNode } from 'react';
import { Button } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { FactRows } from '@/shared/components/FactRows';

/// Every money move asks once more here (rule 7, view 48 Review): the move as
/// the title, what cannot be undone under it, the facts in one card, the
/// primary that repeats the move and turns while it runs, and a quiet button
/// to step back.
export function FactsConfirmSheet({ open, title, rows, note, primaryLabel, busyLabel, quietLabel, busy, error, onConfirm, onClose, children }: {
  open: boolean;
  title: string;
  rows: Array<[string, string]>;
  note?: string;
  primaryLabel: string;
  /// What is happening while the move runs, such as "Releasing 600 USDC".
  busyLabel?: string;
  quietLabel: string;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <ConfirmSheetShell open={open} labelledBy="facts-confirm-title" busy={busy} onClose={onClose}>
      <h2 id="facts-confirm-title" className="text-[19px] font-semibold leading-[1.3] tracking-[-0.01em] text-[var(--ink)]">{title}</h2>
      {note ? <p className="mt-1.5 text-[15px] text-[var(--ink-secondary)]">{note}</p> : null}
      {rows.length ? (
        <div className={`${CARD_CLASS} mt-5 px-5 py-1`}>
          <FactRows facts={rows.map(([label, value]) => ({ label, value: <span dir="auto">{value}</span>, id: label }))} />
        </div>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
      {error ? (
        <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--ink)]">{error}</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-2">
        <Button type="button" data-testid="facts-confirm" size="lg" loading={busy} loadingLabel={busyLabel} onClick={onConfirm} className="w-full">
          {primaryLabel}
        </Button>
        <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={onClose} className="w-full">
          {quietLabel}
        </Button>
      </div>
    </ConfirmSheetShell>
  );
}
