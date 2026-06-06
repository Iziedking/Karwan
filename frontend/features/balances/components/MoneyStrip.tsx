'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { qk } from '@/core/queryKeys';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { Band, SectionTag } from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// The newcomer's first question is "where is my money, and is it safe." This
/// answers it in one glance, in plain dollars, no wallet/USDC/gas jargon:
///   Available  — spendable now (summed across the account's wallets)
///   In escrow  — locked in active deals, can't be touched until release
///   Earned     — settled deals where you were paid
const ACTIVE_STAGES: DealStage[] = [
  'awaiting-acceptance',
  'awaiting-delivery',
  'awaiting-first-release',
  'awaiting-final-release',
];

function money(n: number | null): string {
  if (n == null) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MoneyStrip() {
  const ms = useTranslations().moneyStrip;
  const { address, isAuthenticated } = useAuth();
  // Reuse the shared deal cache so the in-escrow / earned tiles paint from
  // the same source as DealsFeed without a second round-trip.
  const { deals } = useDirectDeals();

  /// Wallet-overview reads three on-chain balances (identity + buyer
  /// agent + seller agent). The QueryInvalidator pokes this key on any
  /// money-moving event via the `wallet-overview` prefix.
  const overviewQuery = useQuery({
    queryKey: address ? qk.walletOverview(address) : ['wallet-overview', 'anon'],
    queryFn: () => api.walletOverview(address!),
    enabled: isAuthenticated && !!address,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const available = overviewQuery.data
    ? (() => {
        const a =
          Number(overviewQuery.data.identity?.usdcBalance ?? 0) +
          Number(overviewQuery.data.agents?.buyer?.usdcBalance ?? 0) +
          Number(overviewQuery.data.agents?.seller?.usdcBalance ?? 0);
        return Number.isFinite(a) ? a : 0;
      })()
    : null;

  const { inEscrow, earned } = useMemo(() => {
    if (!address || deals.length === 0) return { inEscrow: null, earned: null };
    const me = address.toLowerCase();
    let esc = 0;
    let earn = 0;
    for (const d of deals) {
      const amt = Number(d.dealAmountUsdc) || 0;
      const stage = stageOf(d);
      if (ACTIVE_STAGES.includes(stage)) esc += amt;
      else if (stage === 'settled' && d.seller.toLowerCase() === me) earn += amt;
    }
    return { inEscrow: esc, earned: earn };
  }, [deals, address]);

  if (!isAuthenticated || !address) return null;

  const cells = [
    { value: available, label: ms.cells.available.label, hint: ms.cells.available.hint, rail: 'var(--lp-accent)' },
    { value: inEscrow, label: ms.cells.inEscrow.label, hint: ms.cells.inEscrow.hint, rail: '#3a4a85' },
    { value: earned, label: ms.cells.earned.label, hint: ms.cells.earned.hint, rail: '#0a7553' },
  ];

  return (
    <Band tone="light" compact>
      <div className="flex flex-wrap items-end justify-between gap-3 fade-up">
        <SectionTag>{ms.eyebrow}</SectionTag>
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          {ms.heldSafe}
        </p>
      </div>
      <div data-guide="home-money" className="mt-6 grid grid-cols-3 gap-3 fade-up fade-up-1">
        {cells.map((c) => (
          <div
            key={c.label}
            className="relative overflow-hidden px-4 py-4 md:px-5 md:py-5"
            style={{
              background: 'var(--lp-card)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 4,
            }}
          >
            <span
              aria-hidden
              className="absolute start-0 top-0 bottom-0 w-[3px]"
              style={{ background: c.rail }}
            />
            <p className="font-sans text-[clamp(1.2rem,4.5vw,2rem)] font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
              {money(c.value)}
            </p>
            <p
              className="mt-2 mono text-[10px] font-bold uppercase tracking-[0.16em]"
              style={{ color: c.rail }}
            >
              {c.label}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-[var(--lp-text-sub)]">{c.hint}</p>
          </div>
        ))}
      </div>
    </Band>
  );
}
