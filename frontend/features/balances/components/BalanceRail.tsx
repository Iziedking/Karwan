'use client';
import { useEffect, useState } from 'react';
import { useAccount, useBalance, useChainId, useSwitchChain } from 'wagmi';
import { formatUnits } from 'viem';
import { arcTestnet } from '@/core/wagmi';
import { shortAddress, formatUsdc } from '@/shared/utils/format';

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
          className="group inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-full mono text-[10.5px] uppercase tracking-[0.10em] font-bold transition-colors hover:bg-[rgba(178,84,37,0.06)] disabled:opacity-60 disabled:cursor-wait"
          style={{
            background: 'var(--color-surface)',
            color: '#b25425',
            border: '1.5px solid #b25425',
          }}
        >
          <span>{switching ? 'Switching' : 'Switch to Arc'}</span>
          <svg
            width="9"
            height="9"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          >
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <span className="font-sans text-[13px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--color-ink)]">
        {isLoading || !human ? '—' : formatUsdc(human, { withSuffix: false })}
      </span>
      <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
        USDC
      </span>
      <span className="mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
        {shortAddress(address)}
      </span>
    </div>
  );
}
