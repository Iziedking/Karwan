'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
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

const REFRESH_TYPES = new Set([
  'deal.direct.created',
  'deal.accepted',
  'deal.matched',
  'deal.match.approved',
  'escrow.funded',
  'escrow.milestone.released',
  'escrow.settled',
  'deal.auto_released',
  'deal.cancelled',
]);

function money(n: number | null): string {
  if (n == null) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MoneyStrip() {
  const ms = useTranslations().moneyStrip;
  const { address, isAuthenticated } = useAuth();
  const [available, setAvailable] = useState<number | null>(null);
  const [inEscrow, setInEscrow] = useState<number | null>(null);
  const [earned, setEarned] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !address) return;
    let cancelled = false;
    const me = address.toLowerCase();
    const load = () => {
      api
        .walletOverview(address)
        .then((o) => {
          if (cancelled) return;
          const a =
            Number(o.identity?.usdcBalance ?? 0) +
            Number(o.agents?.buyer?.usdcBalance ?? 0) +
            Number(o.agents?.seller?.usdcBalance ?? 0);
          setAvailable(Number.isFinite(a) ? a : 0);
        })
        .catch(() => {});
      api
        .directDeals(address)
        .then(({ deals }) => {
          if (cancelled) return;
          let esc = 0;
          let earn = 0;
          for (const d of deals) {
            const amt = Number(d.dealAmountUsdc) || 0;
            const stage = stageOf(d);
            if (ACTIVE_STAGES.includes(stage)) esc += amt;
            else if (stage === 'settled' && d.seller.toLowerCase() === me) earn += amt;
          }
          setInEscrow(esc);
          setEarned(earn);
        })
        .catch(() => {});
    };
    load();
    const unsub = subscribeLiveEvents((e) => {
      if (REFRESH_TYPES.has(e.type)) setTimeout(load, 600);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [address, isAuthenticated]);

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
