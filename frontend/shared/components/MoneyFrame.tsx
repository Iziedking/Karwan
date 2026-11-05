'use client';
import type { ReactNode, RefObject } from 'react';
import { ConfirmSheetShell } from './ConfirmSheetShell';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Where a money flow shows (view 51, fourth round). As a page it sits in one
/// centred column with Back at the top, the same on a phone and a computer, so
/// Add money, Withdraw and the agent and guarantee moves all read alike. As a
/// sheet it keeps the confirm sheet that opens over another page.
export function MoneyFrame({ page, open = true, labelledBy, busy, onClose, initialFocus, children }: {
  page: boolean;
  open?: boolean;
  labelledBy: string;
  busy: boolean;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const back = useTranslations().moneyPages.back;
  if (!page) {
    return (
      <ConfirmSheetShell open={open} labelledBy={labelledBy} busy={busy} onClose={onClose} initialFocus={initialFocus}>
        {children}
      </ConfirmSheetShell>
    );
  }
  return (
    <section data-money-page aria-labelledby={labelledBy} className="mx-auto w-full max-w-[520px] px-4 pb-24 pt-4 sm:px-0 sm:pt-8">
      <button
        type="button"
        data-own-back
        onClick={onClose}
        disabled={busy}
        className="-ms-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-[15px] font-semibold text-[var(--ink)] hover:bg-[var(--raised)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
      >
        <span aria-hidden className="rtl:rotate-180">‹</span>
        {back}
      </button>
      {children}
    </section>
  );
}
