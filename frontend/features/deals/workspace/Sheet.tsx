'use client';
import { useId, type ReactNode } from 'react';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Everything that is not the money and the next move opens here: a bottom
/// sheet on a phone, a side panel on a wider screen.
export function Sheet({ open, title, onClose, busy = false, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const close = useTranslations().dealWorkspace.simple.close;
  return (
    <ConfirmSheetShell open={open} labelledBy={titleId} busy={busy} onClose={onClose}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-[20px] font-semibold text-[var(--lp-dark)]">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={close}
          className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      {children}
    </ConfirmSheetShell>
  );
}

export const primaryButton =
  'inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--action)] px-5 text-[15px] font-semibold text-[var(--on-action)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2';
export const quietButton =
  'inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--tint)] px-5 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--line)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]';
export const fieldLabel = 'block text-[14px] font-semibold text-[var(--lp-dark)]';
