'use client';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import type { DirectDeal } from '@/core/api';
import { useDirectDeals } from '../hooks/useDirectDeals';
import { useDismissed } from '@/shared/hooks/useDismissed';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

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
  if (deal.cancelledAt || state === 4) return 'cancelled';
  if (deal.disputed || state === 3) return 'disputed';
  const released = deal.onChain?.milestonesReleased ?? 0;
  if (released >= 1) return 'awaiting-final-release';
  if (deal.delivered) return 'awaiting-first-release';
  if (deal.acceptedAt) return 'awaiting-delivery';
  return 'awaiting-acceptance';
}

// Curated palette — slight off-axis hues so the badges feel designed, not
// pulled from default success/error/warning. Each tone has matching bg, fg, and
// a slightly punchier rail color for the row edge marker.
export const STAGE_META: Record<
  DealStage,
  { label: string; rail: string; chipBg: string; chipFg: string }
> = {
  'awaiting-acceptance': {
    label: 'Pending acceptance',
    rail: '#4a5aa3',
    chipBg: 'rgba(60, 74, 138, 0.10)',
    chipFg: '#3a4a85',
  },
  'awaiting-delivery': {
    label: 'Awaiting delivery',
    rail: '#4a5aa3',
    chipBg: 'rgba(60, 74, 138, 0.10)',
    chipFg: '#3a4a85',
  },
  'awaiting-first-release': {
    label: 'Delivered',
    rail: '#c96030',
    chipBg: 'rgba(178, 84, 37, 0.12)',
    chipFg: '#b25425',
  },
  'awaiting-final-release': {
    label: 'Releasing',
    rail: '#c96030',
    chipBg: 'rgba(178, 84, 37, 0.12)',
    chipFg: '#b25425',
  },
  settled: {
    label: 'Settled',
    rail: '#0e8c5f',
    chipBg: 'rgba(10, 117, 83, 0.12)',
    chipFg: '#0a7553',
  },
  cancelled: {
    label: 'Cancelled',
    rail: '#b03d3a',
    chipBg: 'rgba(156, 55, 53, 0.10)',
    chipFg: '#9c3735',
  },
  disputed: {
    label: 'Disputed',
    rail: '#92294a',
    chipBg: 'rgba(126, 36, 64, 0.10)',
    chipFg: '#7e2440',
  },
};

export function StageBadge({ stage }: { stage: DealStage }) {
  const m = STAGE_META[stage];
  return (
    <span
      className="inline-flex items-stretch overflow-hidden text-[10px] mono font-bold uppercase tracking-[0.18em] leading-none"
      style={{
        background: 'var(--lp-card)',
        border: `1px solid ${m.chipFg}33`,
        color: m.chipFg,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        borderBottomLeftRadius: 5,
        borderBottomRightRadius: 2,
        boxShadow: `0 1px 0 ${m.chipFg}1f`,
      }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center px-1.5"
        style={{ background: m.chipFg }}
      >
        <span className="block w-[5px] h-[5px] bg-white" />
      </span>
      <span className="px-2 py-[7px]">{m.label}</span>
    </span>
  );
}

export function DirectDealList({ role }: { role?: 'buyer' | 'seller' }) {
  const { address } = useAccount();
  const { deals, fetchState } = useDirectDeals();
  const { dismissed, dismiss } = useDismissed('direct-deals');

  const a = address?.toLowerCase();
  const scoped = deals.filter((d) => {
    if (role === 'buyer') return d.buyer === a;
    if (role === 'seller') return d.seller === a;
    return true;
  });
  const visible = scoped.filter((d) => !dismissed.has(d.jobId));

  if (fetchState === 'loading' || fetchState === 'idle') {
    return (
      <div className="p-8 space-y-3">
        <div className="h-16 rounded-lg bg-black/[0.05] animate-pulse motion-reduce:animate-none" />
        <div className="h-16 rounded-lg bg-black/[0.05] animate-pulse motion-reduce:animate-none" />
        <div className="h-16 rounded-lg bg-black/[0.05] animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }
  if (fetchState === 'error') {
    return (
      <p className="p-8 text-center mono text-[12px] uppercase tracking-[0.1em] text-[#7a1f1a]">
        Couldn&apos;t load direct deals.
      </p>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="p-10 text-center space-y-2">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {scoped.length === 0 ? 'NO DEALS YET' : 'ALL DISMISSED'}
        </p>
        <p className="text-[13px] text-[var(--lp-text-sub)] max-w-[40ch] mx-auto leading-relaxed">
          {scoped.length === 0
            ? role === 'seller'
              ? 'Deals naming your wallet land here.'
              : role === 'buyer'
                ? 'Deals you open land here.'
                : 'Deals you open or that name your wallet land here.'
            : 'Every deal in this list has been dismissed.'}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--lp-border-light)]">
      {visible.map((deal) => {
        const stage = stageOf(deal);
        const isBuyer = address?.toLowerCase() === deal.buyer;
        const counterparty = isBuyer ? deal.seller : deal.buyer;
        const meta = STAGE_META[stage];
        const dismissable = stage === 'cancelled' || stage === 'settled' || stage === 'disputed';
        return (
          <li key={deal.jobId} className="group relative">
            <Link
              href={`/deals/${deal.jobId}`}
              className={cn(
                'block px-6 py-5 transition-colors hover:bg-[var(--lp-light)]',
                'focus-visible:outline-none focus-visible:bg-[var(--lp-light)]',
              )}
            >
              <span
                aria-hidden
                className="absolute left-0 top-3 bottom-3 w-[3px] transition-opacity duration-200 opacity-50 group-hover:opacity-100"
                style={{ background: meta.rail }}
              />
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
                      {isBuyer ? 'BUYING' : 'SELLING'}
                    </span>
                    <StageBadge stage={stage} />
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="font-sans text-[26px] font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
                      {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}
                    </span>
                    <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      USDC
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] text-[var(--lp-text-sub)] line-clamp-1 max-w-[60ch]">
                    {deal.terms}
                  </p>
                </div>
                <div className="text-right shrink-0 space-y-1.5">
                  <p className="mono text-[10px] uppercase tracking-[0.18em] font-medium text-[var(--lp-text-muted)]">
                    {isBuyer ? 'SELLER' : 'BUYER'}
                  </p>
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 mono text-[11px] border"
                    style={{
                      borderColor: 'var(--lp-border-light)',
                      background: 'var(--lp-light)',
                      color: 'var(--lp-dark)',
                      borderRadius: 2,
                    }}
                  >
                    <span
                      aria-hidden
                      className="w-[5px] h-[5px]"
                      style={{ background: 'var(--lp-accent)' }}
                    />
                    {shortAddress(counterparty)}
                  </span>
                  <p className="mono text-[10px] tabular-nums text-[var(--lp-text-muted)]">
                    {shortHash(deal.jobId, 6, 4)}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--lp-light)] transition-transform duration-200 group-hover:rotate-[20deg] group-hover:translate-x-0.5"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M5 11l6-6M5.5 5h5.5v5.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            </Link>
            {dismissable && (
              <button
                type="button"
                title="Dismiss"
                aria-label="Dismiss this deal from the list"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dismiss(deal.jobId);
                }}
                className="absolute top-2.5 right-2.5 inline-flex items-center justify-center w-6 h-6 rounded-full mono text-[12px] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-light)] transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
              >
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
