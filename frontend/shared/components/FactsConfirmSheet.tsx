'use client';
import type { ReactNode } from 'react';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';

const PRIMARY =
  'inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[15px] font-semibold text-[var(--on-action)] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2';
const QUIET =
  'inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--tint)] px-6 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--line)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';

/// Every money move asks once more here (rule 7): a bottom sheet on phones, a
/// drawer on desktop. The title says the move, the facts sit in rows, the
/// primary repeats the move, and a quiet button lets the person step back.
export function FactsConfirmSheet({ open, title, rows, note, primaryLabel, quietLabel, busy, error, onConfirm, onClose, children }: {
  open: boolean;
  title: string;
  rows: Array<[string, string]>;
  note?: string;
  primaryLabel: string;
  quietLabel: string;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <ConfirmSheetShell open={open} labelledBy="facts-confirm-title" busy={busy} onClose={onClose}>
      <h2 id="facts-confirm-title" className="text-[20px] font-semibold text-[var(--lp-dark)]">{title}</h2>
      {rows.length ? (
        <dl className="mt-4 divide-y divide-[var(--lp-border-light)]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-[14px] text-[var(--lp-text-sub)]">{label}</dt>
              <dd dir="auto" className="min-w-0 text-end text-[14px] font-medium text-[var(--lp-dark)]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
      {note ? <p className="mt-4 text-[14px] font-medium text-[var(--color-warning)]">{note}</p> : null}
      {error ? (
        <p role="alert" className="mt-4 border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{error}</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        <button type="button" data-testid="facts-confirm" disabled={busy} onClick={onConfirm} className={PRIMARY}>{primaryLabel}</button>
        <button type="button" disabled={busy} onClick={onClose} className={QUIET}>{quietLabel}</button>
      </div>
    </ConfirmSheetShell>
  );
}
