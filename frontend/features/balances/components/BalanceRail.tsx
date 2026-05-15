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
          className="group inline-flex items-stretch overflow-hidden mono text-[10px] font-bold uppercase tracking-[0.14em] leading-none text-white transition-[transform,box-shadow] duration-150 hover:-translate-y-px active:translate-y-0 disabled:opacity-70 disabled:cursor-wait disabled:translate-y-0"
          style={{
            background: 'var(--color-ink)',
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 2,
            boxShadow: '0 2px 0 rgba(0,0,0,0.22)',
          }}
        >
          <span
            aria-hidden
            className="flex items-center justify-center px-1.5"
            style={{ background: '#b25425' }}
          >
            <span
              aria-hidden
              data-instrument-blink
              className="inline-block w-[5px] h-[5px] bg-white"
              style={{ animation: 'instrumentBlink 1.6s ease-in-out infinite' }}
            />
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-[6px]">
            <span>{switching ? 'Switching' : 'Switch to Arc'}</span>
            <svg
              width="9"
              height="9"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              className="transition-transform group-hover:translate-x-0.5 opacity-90"
            >
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
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
