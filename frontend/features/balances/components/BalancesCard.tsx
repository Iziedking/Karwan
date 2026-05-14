'use client';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { shortAddress } from '@/shared/utils/format';
import { SOURCE_CHAINS } from '@/features/bridge/config';
import { arcTestnet } from '@/core/wagmi';
import { ChainLogo, type ChainKey } from '@/shared/components/ChainLogo';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';

const CHAIN_META: Record<string, { name: string; sub: string; key: ChainKey }> = {
  arc: { name: 'Arc', sub: 'Testnet', key: 'arc' },
  baseSepolia: { name: 'Base', sub: 'Sepolia', key: 'baseSepolia' },
  sepolia: { name: 'Ethereum', sub: 'Sepolia', key: 'sepolia' },
};

const CARD = 'rounded-[24px] bg-[var(--lp-card)] border border-black/[0.06]';

export function BalancesCard() {
  const { address, isConnected } = useAccount();

  const arc = useBalance({ address, chainId: arcTestnet.id });
  const baseSep = useBalance({
    address,
    chainId: SOURCE_CHAINS.baseSepolia.chainId,
    token: SOURCE_CHAINS.baseSepolia.usdc,
  });
  const ethSep = useBalance({
    address,
    chainId: SOURCE_CHAINS.sepolia.chainId,
    token: SOURCE_CHAINS.sepolia.usdc,
  });

  if (!isConnected || !address) {
    return (
      <div className={`${CARD} p-7`}>
        <p className="text-[13px] text-[var(--lp-text-sub)]">
          Connect your wallet to see USDC balances.
        </p>
      </div>
    );
  }

  const busy = arc.isRefetching || baseSep.isRefetching || ethSep.isRefetching;
  const lastUpdated = Math.max(arc.dataUpdatedAt, baseSep.dataUpdatedAt, ethSep.dataUpdatedAt);

  function refreshAll() {
    arc.refetch();
    baseSep.refetch();
    ethSep.refetch();
  }

  const rows: Array<{ key: keyof typeof CHAIN_META; data: typeof arc.data; loading: boolean }> = [
    { key: 'arc', data: arc.data, loading: arc.isLoading },
    { key: 'baseSepolia', data: baseSep.data, loading: baseSep.isLoading },
    { key: 'sepolia', data: ethSep.data, loading: ethSep.isLoading },
  ];

  return (
    <div className={CARD}>
      <div className="px-7 pt-6 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-sans text-[20px] font-bold tracking-[-0.02em] text-[var(--lp-dark)]">
            Holdings
          </h2>
          <p className="mono text-[11px] text-[var(--lp-text-muted)] mt-0.5">
            across {rows.length} chains
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[11px] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors disabled:opacity-60 disabled:cursor-wait shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-full px-1.5 py-0.5"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className={busy ? 'animate-spin motion-reduce:animate-none' : ''}
          >
            <path
              d="M14 8a6 6 0 1 1-1.76-4.24M14 3v3h-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {busy ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <ul className="px-7">
        {rows.map((r, i) => {
          const m = CHAIN_META[r.key]!;
          const num =
            r.loading || !r.data
              ? null
              : Number(formatUnits(r.data.value, r.data.decimals));
          return (
            <li
              key={r.key}
              className={`flex items-center gap-3 py-3.5 ${
                i < rows.length - 1 ? 'border-b border-[var(--lp-border-light)]' : ''
              }`}
            >
              <ChainLogo chain={m.key} size={32} />
              <div className="flex-1 min-w-0">
                <p className="font-sans text-[14px] font-semibold tracking-[-0.01em] text-[var(--lp-dark)] leading-tight">
                  {m.name}
                </p>
                <p className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] mt-0.5">
                  {m.sub}
                </p>
              </div>
              <div className="text-right">
                <p className="font-sans text-[20px] font-bold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
                  {num === null ? '—' : <AnimatedNumber value={num} decimals={2} />}
                </p>
                <p className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] mt-1">
                  USDC
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="px-7 py-3.5 mt-1 border-t border-[var(--lp-border-light)] flex items-baseline justify-between gap-3">
        <p className="mono text-[11px] text-[var(--lp-text-muted)]">{shortAddress(address)}</p>
        {lastUpdated > 0 && (
          <p className="mono text-[10px] text-[var(--lp-text-muted)]">updated {timeAgo(lastUpdated)}</p>
        )}
      </div>
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
