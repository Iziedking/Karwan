'use client';
import { useBalances } from '../hooks/useBalances';
import { shortAddress, formatUsdc } from '@/shared/utils/format';

export function BalanceRail() {
  const { balances, error } = useBalances();

  if (error) {
    return (
      <div className="text-[11px] text-[var(--color-critical)] mono">balances unavailable</div>
    );
  }

  if (!balances) {
    return <div className="h-4" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
      {balances.map((b) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="text-[var(--color-ink-faint)] capitalize">{b.label}</span>
          <span className="mono text-[var(--color-ink)]">
            {b.balanceUsdc ? formatUsdc(b.balanceUsdc) : '—'}
          </span>
          <span className="mono text-[10px] text-[var(--color-ink-faint)]">{shortAddress(b.address)}</span>
        </div>
      ))}
    </div>
  );
}
