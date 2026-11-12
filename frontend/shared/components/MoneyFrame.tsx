'use client';
import type { ReactNode, RefObject } from 'react';
import { ConfirmSheetShell } from './ConfirmSheetShell';
import { usePathname } from 'next/navigation';
import { ProductBackLink } from './ProductBackLink';

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
  const pathname = usePathname();
  if (!page) {
    return (
      <ConfirmSheetShell open={open} labelledBy={labelledBy} busy={busy} onClose={onClose} initialFocus={initialFocus}>
        {children}
      </ConfirmSheetShell>
    );
  }
  return (
    <section data-money-page aria-labelledby={labelledBy} className="product-surface mx-auto w-full max-w-[520px] px-4 pb-24 pt-4 sm:px-0 sm:pt-8">
      <div data-own-back className="mb-4">
        <ProductBackLink pathname={pathname} isAuthenticated onBack={onClose} disabled={busy} />
      </div>
      {children}
    </section>
  );
}
