'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, type SellerActiveBid } from '@/core/api';
import { buttonClasses } from '@/shared/components/Button';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { cn } from '@/shared/utils/cn';

/// One offer your agent made on a buyer's request, said in words: under the
/// posted offer it came from, or as its own row when it came from your selling
/// settings (owner, 7 Nov 2026, Figma 203:804). Never a request id or a wallet.
export function OfferBidLine({ bid, nested, onWithdrawn }: { bid: SellerActiveBid; nested: boolean; onWithdrawn: (jobId: string) => void }) {
  const row = useTranslations().bidsTable.row;
  const money = useMoneyText({ compact: true });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const price = money.text(bid.lastBidPrice);
  const said = bid.title ? row.onRequest.replace('{price}', price).replace('{title}', bid.title) : row.onRequestUntitled.replace('{price}', price);

  async function withdraw() {
    setBusy(true);
    try {
      await api.abandonBid(bid.jobId);
      onWithdrawn(bid.jobId);
    } catch {
      // The agent keeps the offer when the withdrawal fails.
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div
      data-offer-bid={bid.jobId}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2',
        nested ? 'rounded-[14px] border border-[var(--line)] bg-[var(--canvas)] px-3.5 py-3' : 'py-3.5',
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--action)]" />
      <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-[var(--ink)]">
        <span dir="auto" className="break-words">{said}</span>
        <span className="ms-2 rounded-full bg-[var(--tint)] px-2 py-0.5 text-[13px] font-semibold text-[var(--ink-secondary)]">
          {bid.counterRounds > 0 ? row.round.replace('{n}', String(bid.counterRounds)) : row.talking}
        </span>
      </span>
      {bid.finalized ? null : confirming ? (
        <button type="button" disabled={busy} onClick={() => void withdraw()} className="min-h-11 px-2 text-[14px] font-semibold text-[var(--ink)] underline underline-offset-4 disabled:opacity-50">
          {busy ? '…' : row.withdrawConfirm}
        </button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="min-h-11 px-2 text-[14px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)]">
          {row.withdraw}
        </button>
      )}
      <Link href={`/jobs/${bid.jobId}`} className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'rounded-full' })}>
        {row.open}
      </Link>
    </div>
  );
}
