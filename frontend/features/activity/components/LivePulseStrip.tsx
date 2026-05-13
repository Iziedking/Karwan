'use client';
import { useMemo } from 'react';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';

const ALL_TYPES = [
  'job.tracked',
  'bid.submitted',
  'counter.issued',
  'counter.response.submitted',
  'bid.accepted',
  'escrow.funded',
  'escrow.milestone.released',
  'escrow.settled',
];

export function LivePulseStrip() {
  const events = useLiveEvents(undefined, 200);
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = today.getTime();
    const filtered = events.filter((e) => e.ts >= since && ALL_TYPES.includes(e.type));
    const deals = new Set(
      filtered.filter((e) => e.type === 'escrow.funded' && e.jobId).map((e) => e.jobId!),
    );
    const settled = new Set(
      filtered.filter((e) => e.type === 'escrow.settled' && e.jobId).map((e) => e.jobId!),
    );
    const usdcMoved = filtered
      .filter((e) => e.type === 'escrow.milestone.released')
      .reduce((sum, e) => {
        const amountWei = (e.payload?.amountWei as string | undefined) ?? '0';
        return sum + Number(amountWei) / 1_000_000;
      }, 0);
    return {
      deals: deals.size,
      settled: settled.size,
      usdcMoved,
      pulse: filtered[0]?.ts ?? 0,
    };
  }, [events]);

  const justPulsed = Date.now() - stats.pulse < 4000;

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-[var(--color-line)]">
        <PulseStat label="Deals today" value={stats.deals} active={justPulsed} />
        <PulseStat label="Settled" value={stats.settled} />
        <PulseStat
          label="USDC released"
          value={stats.usdcMoved.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          unit="USDC"
        />
      </div>
    </div>
  );
}

function PulseStat({
  label,
  value,
  unit,
  active,
}: {
  label: string;
  value: number | string;
  unit?: string;
  active?: boolean;
}) {
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-3">
      <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">{label}</span>
      <span className="inline-flex items-baseline gap-1">
        <span className={`text-[22px] mono font-semibold tracking-tight text-[var(--color-ink)] ${active ? 'pulse-once' : ''}`}>
          {value}
        </span>
        {unit && <span className="text-[11px] text-[var(--color-ink-faint)] mono">{unit}</span>}
      </span>
    </div>
  );
}
