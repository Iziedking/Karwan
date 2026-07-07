'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
///   Available  : spendable now (summed across the account's wallets)
///   In escrow  : locked in active deals, can't be touched until release
///   Earned     : settled deals where you were paid
const ACTIVE_STAGES: DealStage[] = [
  'awaiting-acceptance',
  'awaiting-delivery',
  'awaiting-first-release',
  'awaiting-final-release',
];

function money(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Cell {
  value: number | null;
  label: string;
  hint: string;
  rail: string;
}

/// One money tile. Shared by the desktop three-up row and the mobile rotator so
/// both read identically; only the layout around them differs.
function MoneyCard({ cell }: { cell: Cell }) {
  return (
    <div
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
      <span aria-hidden className="absolute start-0 top-0 bottom-0 w-[3px]" style={{ background: cell.rail }} />
      <p className="font-sans text-[clamp(1.2rem,4.5vw,2rem)] font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
        {money(cell.value)}
        {cell.value != null && (
          <span className="ms-1.5 mono text-[0.45em] font-bold uppercase tracking-[0.12em] align-baseline text-[var(--lp-text-muted)]">
            USDC
          </span>
        )}
      </p>
      <p className="mt-2 mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: cell.rail }}>
        {cell.label}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-[var(--lp-text-sub)]">{cell.hint}</p>
    </div>
  );
}

/// Mobile-only rotator: one card at a time, crossfading through Available ->
/// In escrow -> Earned so the phone view stays uncluttered. Tappable dots jump
/// to a tile. Auto-advance pauses off screen and is disabled under reduced
/// motion (which instead stacks all three so nothing is hidden behind motion).
function MoneyRotator({ cells }: { cells: Cell[] }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || !visible) return;
    const t = setInterval(() => setI((n) => (n + 1) % cells.length), 4200);
    return () => clearInterval(t);
  }, [reduce, visible, cells.length]);

  if (reduce) {
    return (
      <div className="grid gap-3">
        {cells.map((c) => (
          <MoneyCard key={c.label} cell={c} />
        ))}
      </div>
    );
  }

  const active = cells[Math.min(i, cells.length - 1)]!;
  return (
    <div ref={ref}>
      <AnimatePresence mode="wait">
        <motion.div
          key={active.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <MoneyCard cell={active} />
        </motion.div>
      </AnimatePresence>
      <div className="mt-3 flex justify-center gap-1.5">
        {cells.map((c, idx) => (
          <button
            key={c.label}
            type="button"
            aria-label={`Show ${c.label}`}
            aria-current={idx === i}
            onClick={() => setI(idx)}
            className="size-1.5 rounded-full transition-colors"
            style={{ background: idx === i ? c.rail : 'var(--lp-border-light)' }}
          />
        ))}
      </div>
    </div>
  );
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
    // Live cadence: refetch every 5s (silent background, paused when the tab is
    // hidden) so the money tiles track top-ups, settlements, and the activation
    // seed without a manual refresh. SSE still updates instantly on deal events.
    staleTime: 20_000,
    refetchInterval: 20_000,
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
      <div data-guide="home-money" className="mt-6 fade-up fade-up-1">
        {/* Mobile: one rotating card so the phone view stays uncluttered. */}
        <div className="sm:hidden">
          <MoneyRotator cells={cells} />
        </div>
        {/* Desktop: all three at a glance. */}
        <div className="hidden sm:grid grid-cols-3 gap-3">
          {cells.map((c) => (
            <MoneyCard key={c.label} cell={c} />
          ))}
        </div>
      </div>
    </Band>
  );
}
