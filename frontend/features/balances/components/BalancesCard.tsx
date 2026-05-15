'use client';
import { useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { shortAddress } from '@/shared/utils/format';
import { SOURCE_CHAINS } from '@/features/bridge/config';
import { arcTestnet } from '@/core/wagmi';
import { cn } from '@/shared/utils/cn';
import { ChainLogo, type ChainKey } from '@/shared/components/ChainLogo';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';

const CHAIN_META: Record<string, { name: string; sub: string; key: ChainKey }> = {
  arc: { name: 'Arc', sub: 'Testnet', key: 'arc' },
  baseSepolia: { name: 'Base', sub: 'Sepolia', key: 'baseSepolia' },
  sepolia: { name: 'Ethereum', sub: 'Sepolia', key: 'sepolia' },
};

const CARD = 'rounded-[24px] bg-[var(--lp-card)] border border-black/[0.06] h-full flex flex-col';

type View = 'you' | 'buyer' | 'seller';

export function BalancesCard({
  buyerAgent,
  sellerAgent,
}: {
  buyerAgent?: string;
  sellerAgent?: string;
} = {}) {
  const { address, isConnected } = useAccount();
  const [view, setView] = useState<View>('you');

  const yArc = useBalance({ address, chainId: arcTestnet.id });
  const yBase = useBalance({
    address,
    chainId: SOURCE_CHAINS.baseSepolia.chainId,
    token: SOURCE_CHAINS.baseSepolia.usdc,
  });
  const yEth = useBalance({
    address,
    chainId: SOURCE_CHAINS.sepolia.chainId,
    token: SOURCE_CHAINS.sepolia.usdc,
  });

  const buyer = (buyerAgent as `0x${string}` | undefined) ?? undefined;
  const bArc = useBalance({ address: buyer, chainId: arcTestnet.id });
  const bBase = useBalance({
    address: buyer,
    chainId: SOURCE_CHAINS.baseSepolia.chainId,
    token: SOURCE_CHAINS.baseSepolia.usdc,
  });
  const bEth = useBalance({
    address: buyer,
    chainId: SOURCE_CHAINS.sepolia.chainId,
    token: SOURCE_CHAINS.sepolia.usdc,
  });

  const seller = (sellerAgent as `0x${string}` | undefined) ?? undefined;
  const sArc = useBalance({ address: seller, chainId: arcTestnet.id });
  const sBase = useBalance({
    address: seller,
    chainId: SOURCE_CHAINS.baseSepolia.chainId,
    token: SOURCE_CHAINS.baseSepolia.usdc,
  });
  const sEth = useBalance({
    address: seller,
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

  const groups = {
    you: { address, arc: yArc, base: yBase, eth: yEth },
    buyer: { address: buyer, arc: bArc, base: bBase, eth: bEth },
    seller: { address: seller, arc: sArc, base: sBase, eth: sEth },
  } as const;

  const active = groups[view];
  const tabs: Array<{ key: View; label: string; disabled?: boolean }> = [
    { key: 'you', label: 'You' },
    { key: 'buyer', label: 'Buyer', disabled: !buyer },
    { key: 'seller', label: 'Seller', disabled: !seller },
  ];

  const allBalances = [yArc, yBase, yEth, bArc, bBase, bEth, sArc, sBase, sEth];
  const busy = allBalances.some((b) => b.isRefetching);
  const lastUpdated = Math.max(
    ...allBalances.map((b) => b.dataUpdatedAt).filter((t) => t > 0),
    0,
  );

  function refreshAll() {
    for (const b of allBalances) b.refetch();
  }

  const rows: Array<{ key: keyof typeof CHAIN_META; data: typeof yArc.data; loading: boolean }> = [
    { key: 'arc', data: active.arc.data, loading: active.arc.isLoading },
    { key: 'baseSepolia', data: active.base.data, loading: active.base.isLoading },
    { key: 'sepolia', data: active.eth.data, loading: active.eth.isLoading },
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

      <div className="px-7 pb-3">
        <div className="inline-flex rounded-full p-1 gap-1 bg-[var(--lp-light)]">
          {tabs.map((t) => {
            const isActive = view === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => !t.disabled && setView(t.key)}
                disabled={t.disabled}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] font-semibold tracking-tight transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                  isActive
                    ? 'bg-[var(--lp-dark)] text-white'
                    : t.disabled
                      ? 'text-[var(--lp-text-muted)] opacity-50 cursor-not-allowed'
                      : 'text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="px-7">
        {rows.map((r, i) => {
          const m = CHAIN_META[r.key]!;
          const num =
            r.loading || !r.data ? null : Number(formatUnits(r.data.value, r.data.decimals));
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

      <div className="px-7 py-3.5 mt-auto border-t border-[var(--lp-border-light)] flex items-baseline justify-between gap-3">
        <p className="mono text-[11px] text-[var(--lp-text-muted)]">
          {active.address ? shortAddress(active.address) : 'not configured'}
        </p>
        {lastUpdated > 0 && (
          <p className="mono text-[10px] text-[var(--lp-text-muted)]">
            updated {timeAgo(lastUpdated)}
          </p>
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
