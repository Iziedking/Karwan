'use client';
import { useEffect, useState } from 'react';
import { useAccount, useBalance, useChainId, useSwitchChain } from 'wagmi';
import { formatUnits } from 'viem';
import { arcTestnet } from '@/core/wagmi';
import { shortAddress, formatUsdc } from '@/shared/utils/format';

const ARC_GREEN = '#0E5E3E';

export function BalanceRail() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data, isLoading } = useBalance({ address, chainId: arcTestnet.id });

  if (!mounted || !isConnected || !address) return null;

  const onArc = chainId === arcTestnet.id;
  const human = data ? formatUnits(data.value, data.decimals) : null;

  return (
    <div className="flex items-center gap-2 text-[12px]">
      {!onArc && (
        <button
          type="button"
          onClick={() => switchChain({ chainId: arcTestnet.id })}
          disabled={switching}
          title="Your wallet is not on Arc Testnet"
          className="group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-tight overflow-hidden transition-all hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait disabled:translate-y-0"
          style={{
            background: 'linear-gradient(180deg, #14181c 0%, #0c0e10 100%)',
            color: '#ffffff',
            border: `1px solid color-mix(in oklab, ${ARC_GREEN} 55%, #14181c)`,
            boxShadow: `0 0 0 1px color-mix(in oklab, ${ARC_GREEN} 18%, transparent), 0 0 20px -4px color-mix(in oklab, ${ARC_GREEN} 60%, transparent), 0 2px 6px -2px rgba(0,0,0,0.45)`,
          }}
        >
          {/* Pulsing outer halo */}
          <span
            aria-hidden
            className="absolute -inset-px rounded-full pointer-events-none"
            style={{
              border: `1px solid color-mix(in oklab, ${ARC_GREEN} 80%, transparent)`,
              opacity: 0.65,
              animation: 'flowPulse 2.2s ease-out infinite',
            }}
          />
          {/* Diagonal sheen sweep */}
          <span
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.10) 50%, transparent 60%)',
              animation: 'stat-sweep 3.4s linear infinite',
              width: '40%',
            }}
          />
          {/* Live Arc dot */}
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-80 animate-ping"
              style={{ background: ARC_GREEN }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: ARC_GREEN, boxShadow: `0 0 6px ${ARC_GREEN}` }}
            />
          </span>
          <span className="relative">{switching ? 'Switching…' : 'Switch to Arc'}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className="relative transition-transform group-hover:translate-x-0.5"
          >
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <span className="mono text-[var(--color-ink)] tabular-nums">
        {isLoading || !human ? '—' : formatUsdc(human)}
      </span>
      <span className="mono text-[10px] text-[var(--color-ink-faint)]">{shortAddress(address)}</span>
    </div>
  );
}
