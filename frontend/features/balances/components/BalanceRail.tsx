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
          className="group inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[11px] font-medium tracking-tight transition-all hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait disabled:translate-y-0"
          style={{
            background: 'linear-gradient(180deg, #F2FBF6 0%, #E6F5EC 100%)',
            color: ARC_GREEN,
            border: '1px solid #C9E5D5',
          }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full rounded-full"
              style={{
                background: ARC_GREEN,
                opacity: 0.35,
                animation: 'flowPulse 2.4s ease-out infinite',
              }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: ARC_GREEN }}
            />
          </span>
          <span>{switching ? 'Switching' : 'Switch to Arc'}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5 opacity-70"
          >
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.6"
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
