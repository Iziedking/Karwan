'use client';
import { useEffect, useState } from 'react';
import { useBalance, useChainId, useSwitchChain } from 'wagmi';
import { formatUnits } from 'viem';
import { arcTestnet } from '@/core/wagmi';
import { shortAddress, formatUsdc } from '@/shared/utils/format';
import { useAuth } from '@/shared/hooks/useAuth';
import { useClipboard } from '@/shared/hooks/useClipboard';

export function BalanceRail() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const auth = useAuth();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data, isLoading } = useBalance({
    address: auth.address as `0x${string}` | undefined,
    chainId: arcTestnet.id,
  });
  const { copied, copy } = useClipboard();

  if (!mounted || !auth.isAuthenticated || !auth.address) return null;

  // Circle identity wallets live on Arc; they have no concept of a "current
  // chain" the way a wagmi-connected wallet does. Bridging into Arc from
  // another chain still works for them: they receive USDC at this address
  // via the in-app bridge (with a web3 wallet on the source chain) or any
  // external bridge. The "Switch to Arc" affordance only makes sense for
  // wagmi users whose connected wallet is on the wrong chain.
  const isWeb3 = auth.method === 'web3';
  const onArc = !isWeb3 || chainId === arcTestnet.id;
  const human = data ? formatUnits(data.value, data.decimals) : null;
  const address = auth.address;

  return (
    <div className="flex items-center gap-2 text-[12px] whitespace-nowrap">
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
        {isLoading || !human ? '-' : formatUsdc(human, { withSuffix: false })}
      </span>
      <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
        USDC
      </span>
      <button
        type="button"
        onClick={() => copy(address)}
        title={copied ? 'Copied' : `Click to copy ${address}`}
        aria-label={`Copy address ${address}`}
        className="mono text-[10px] tabular-nums whitespace-nowrap text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-sm px-0.5 transition-colors"
      >
        {copied ? 'Copied' : shortAddress(address)}
      </button>
    </div>
  );
}
