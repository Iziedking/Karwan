'use client';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import type { DirectDeal } from '@/core/api';
import { useDirectDeals } from '../hooks/useDirectDeals';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';

export type DealStage =
  | 'awaiting-acceptance'
  | 'awaiting-delivery'
  | 'awaiting-first-release'
  | 'awaiting-final-release'
  | 'settled'
  | 'cancelled'
  | 'disputed';

export function stageOf(deal: DirectDeal): DealStage {
  const state = deal.onChain?.state ?? 1;
  if (state === 2) return 'settled';
  // Refunded on chain (state 4) or flagged cancelled = buyer reclaimed funds.
  if (deal.cancelledAt || state === 4) return 'cancelled';
  if (deal.disputed || state === 3) return 'disputed';
  const released = deal.onChain?.milestonesReleased ?? 0;
  if (released >= 1) return 'awaiting-final-release';
  if (deal.delivered) return 'awaiting-first-release';
  if (deal.acceptedAt) return 'awaiting-delivery';
  return 'awaiting-acceptance';
}

// Fixed status colors. StageBadge renders on fixed white --lp-card surfaces, so
// it must not borrow the themeable --color-* tokens (they flip to dark values
// in dark mode and the pill turns black on a white card).
const STAGE_META: Record<DealStage, { label: string; color: string; bg: string }> = {
  'awaiting-acceptance': {
    label: 'Awaiting seller acceptance',
    color: '#2c5f8f',
    bg: 'rgba(44,95,143,0.10)',
  },
  'awaiting-delivery': {
    label: 'Awaiting delivery',
    color: '#2c5f8f',
    bg: 'rgba(44,95,143,0.10)',
  },
  'awaiting-first-release': {
    label: 'Delivered · awaiting release',
    color: '#b45309',
    bg: 'rgba(180,83,9,0.12)',
  },
  'awaiting-final-release': {
    label: 'Awaiting final release',
    color: '#b45309',
    bg: 'rgba(180,83,9,0.12)',
  },
  settled: {
    label: 'Settled',
    color: '#15803d',
    bg: 'rgba(21,128,61,0.12)',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#b91c1c',
    bg: 'rgba(185,28,28,0.10)',
  },
  disputed: {
    label: 'Disputed',
    color: '#9a1f3a',
    bg: 'rgba(154,31,58,0.12)',
  },
};

export function StageBadge({ stage }: { stage: DealStage }) {
  const m = STAGE_META[stage];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={{ background: m.bg, color: m.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

/// `role` scopes the list to one side of the deal: 'buyer' shows only deals
/// the connected wallet opened, 'seller' only deals that name it as seller.
/// Omitting it shows both sides.
export function DirectDealList({ role }: { role?: 'buyer' | 'seller' }) {
  const { address } = useAccount();
  const { deals, fetchState } = useDirectDeals();

  const a = address?.toLowerCase();
  const scoped = deals.filter((d) => {
    if (role === 'buyer') return d.buyer === a;
    if (role === 'seller') return d.seller === a;
    return true;
  });

  if (fetchState === 'loading' || fetchState === 'idle') {
    return <p className="px-5 py-8 text-[13px] text-[var(--color-ink-faint)]">Loading deals…</p>;
  }
  if (fetchState === 'error') {
    return (
      <p className="px-5 py-8 text-[13px] text-[var(--color-ink-faint)]">
        Couldn&apos;t load direct deals.
      </p>
    );
  }
  if (scoped.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-[13px] text-[var(--color-ink-dim)]">No direct deals yet.</p>
        <p className="text-[11px] text-[var(--color-ink-faint)] mt-1">
          {role === 'seller'
            ? 'Deals that name your wallet as the seller show up here.'
            : role === 'buyer'
            ? 'Deals you open show up here.'
            : 'Deals you open or that name your wallet show up here.'}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--color-line)]">
      {scoped.map((deal) => {
        const stage = stageOf(deal);
        const isBuyer = address?.toLowerCase() === deal.buyer;
        const counterparty = isBuyer ? deal.seller : deal.buyer;
        return (
          <li key={deal.jobId}>
            <Link
              href={`/deals/${deal.jobId}`}
              className="block px-5 py-4 hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                      {isBuyer ? 'You buying' : 'You selling'}
                    </span>
                    <StageBadge stage={stage} />
                  </div>
                  <p
                    className="text-[19px] font-medium tabular-nums tracking-tight mt-1.5"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {formatUsdc(deal.dealAmountUsdc)}
                  </p>
                  <p className="text-[12px] text-[var(--color-ink-dim)] mt-0.5 line-clamp-1">
                    {deal.terms}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                    {isBuyer ? 'Seller' : 'Buyer'}
                  </p>
                  <p className="text-[12px] mono text-[var(--color-ink-dim)] mt-0.5">
                    {shortAddress(counterparty)}
                  </p>
                  <p className="text-[10px] mono text-[var(--color-ink-faint)] mt-1.5">
                    {shortHash(deal.jobId, 6, 4)}
                  </p>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
