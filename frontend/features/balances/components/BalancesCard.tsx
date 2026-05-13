'use client';
import { useBalances } from '../hooks/useBalances';
import { Card } from '@/shared/components/Card';
import { shortAddress, formatUsdc, relativeTime } from '@/shared/utils/format';

export function BalancesCard() {
  const { balances, fetchedAt, error } = useBalances();

  return (
    <Card
      title="Wallet balances"
      action={fetchedAt && <span className="text-[11px] text-[var(--color-ink-faint)]">updated {relativeTime(fetchedAt)}</span>}
    >
      {error ? (
        <p className="text-sm text-[var(--color-critical)] mono">{error}</p>
      ) : !balances ? (
        <p className="text-sm text-[var(--color-ink-faint)]">Loading…</p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)] -my-3">
          {balances.map((b) => (
            <li key={b.label} className="py-3 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm capitalize text-[var(--color-ink)]">{b.label} agent</span>
                <span className="text-[11px] mono text-[var(--color-ink-faint)]">{shortAddress(b.address)}</span>
              </div>
              <span className="text-base mono text-[var(--color-ink)]">
                {b.balanceUsdc ? formatUsdc(b.balanceUsdc) : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
