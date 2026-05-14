'use client';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { Card } from '@/shared/components/Card';
import { shortAddress, formatUsdc } from '@/shared/utils/format';
import { SOURCE_CHAINS } from '@/features/bridge/config';
import { arcTestnet } from '@/core/wagmi';

const CHAIN_MARKS: Record<string, { letter: string; bg: string; fg: string; name: string; sub: string }> = {
  arc:         { letter: 'A', bg: '#0E5E3E', fg: '#FFFFFF', name: 'Arc',      sub: 'Testnet' },
  baseSepolia: { letter: 'B', bg: '#0052FF', fg: '#FFFFFF', name: 'Base',     sub: 'Sepolia' },
  sepolia:     { letter: 'E', bg: '#627EEA', fg: '#FFFFFF', name: 'Ethereum', sub: 'Sepolia' },
};

function Mark({ which, size = 22 }: { which: keyof typeof CHAIN_MARKS; size?: number }) {
  const m = CHAIN_MARKS[which]!;
  return (
    <span
      className="inline-flex items-center justify-center rounded-[6px] font-bold mono shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: m.bg,
        color: m.fg,
        fontSize: size * 0.5,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)',
      }}
      aria-label={m.name}
    >
      {m.letter}
    </span>
  );
}

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
      <Card>
        <p className="text-[13px] text-[var(--color-ink-faint)]">
          Connect your wallet to see USDC balances.
        </p>
      </Card>
    );
  }

  const busy = arc.isRefetching || baseSep.isRefetching || ethSep.isRefetching;
  const lastUpdated = Math.max(arc.dataUpdatedAt, baseSep.dataUpdatedAt, ethSep.dataUpdatedAt);

  function refreshAll() {
    arc.refetch();
    baseSep.refetch();
    ethSep.refetch();
  }

  const rows: Array<{ key: keyof typeof CHAIN_MARKS; data: typeof arc.data; loading: boolean }> = [
    { key: 'arc',         data: arc.data,     loading: arc.isLoading },
    { key: 'baseSepolia', data: baseSep.data, loading: baseSep.isLoading },
    { key: 'sepolia',     data: ethSep.data,  loading: ethSep.isLoading },
  ];

  return (
    <Card noPadding>
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="display text-[22px]">Holdings</h2>
          <p className="text-[11px] mono text-[var(--color-ink-faint)] mt-0.5">
            across {rows.length} chains
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors disabled:opacity-60 disabled:cursor-wait shrink-0"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className={busy ? 'animate-spin' : ''}
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

      <ul className="px-5 pb-3">
        {rows.map((r, i) => {
          const m = CHAIN_MARKS[r.key]!;
          const value =
            r.loading || !r.data
              ? '—'
              : formatUsdc(formatUnits(r.data.value, r.data.decimals), { withSuffix: false });
          return (
            <li
              key={r.key}
              className={`flex items-center gap-3 py-3 ${
                i < rows.length - 1 ? 'border-b border-[var(--color-line)]' : ''
              }`}
            >
              <Mark which={r.key} size={26} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold tracking-tight leading-tight">{m.name}</p>
                <p className="text-[10px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)] mt-0.5">
                  {m.sub}
                </p>
              </div>
              <div className="text-right">
                <p
                  className="text-[22px] font-medium tabular-nums tracking-tight leading-none"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {value}
                </p>
                <p className="text-[10px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)] mt-1">
                  USDC
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="px-5 py-3 border-t border-[var(--color-line)] flex items-baseline justify-between gap-3">
        <p className="text-[11px] mono text-[var(--color-ink-faint)]">{shortAddress(address)}</p>
        {lastUpdated > 0 && (
          <p className="text-[10px] mono text-[var(--color-ink-faint)]">
            updated {timeAgo(lastUpdated)}
          </p>
        )}
      </div>
    </Card>
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
