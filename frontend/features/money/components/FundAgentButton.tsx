'use client';
import { useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { MoneySheet } from './MoneySheet';

/// The way into the money sheet from a flow that needs the buying agent funded:
/// posting a request, or funding a deal on the classic deal page. The amount the
/// flow needs is filled in, and the person can change it.
export function FundAgentButton({ amountUsdc, onFunded }: { amountUsdc: number; onFunded?: () => void }) {
  const t = useTranslations().money;
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 space-y-2">
      <p className="text-[14px] text-[var(--lp-dark)]">{t.fund.line}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-[10px] border border-[var(--lp-outline-strong)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {t.sheet.titleTopUpBuyer}
      </button>
      <MoneySheet
        open={open}
        onClose={() => setOpen(false)}
        move="topUp"
        agent="buyer"
        prefillAmount={amountUsdc > 0 ? amountUsdc : undefined}
        onDone={onFunded}
      />
    </div>
  );
}
