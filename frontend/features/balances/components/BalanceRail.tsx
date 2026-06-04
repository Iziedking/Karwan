'use client';
import { useEffect, useState } from 'react';
import { useBalance, useChainId, useSwitchChain } from 'wagmi';
import { formatUnits } from 'viem';
import { arcTestnet } from '@/core/wagmi';
import { shortAddress, formatUsdc } from '@/shared/utils/format';
import { useAuth } from '@/shared/hooks/useAuth';
import { useClipboard } from '@/shared/hooks/useClipboard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export function BalanceRail() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const br = useTranslations().balanceRail;
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

  // Off Arc, the call to action is the only thing that matters, so it REPLACES
  // the balance + address rather than sitting beside them. That keeps the rail
  // the same width in both states. the bar can't grow and clip the controls to
  // its right when a web3 wallet lands on the wrong chain.
  if (!onArc) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        disabled={switching}
        title={br.switch.title}
        className="group inline-flex items-center gap-1.5 mono text-[10.5px] uppercase tracking-[0.10em] font-bold transition-colors disabled:opacity-60 disabled:cursor-wait"
        style={{ color: '#b25425' }}
      >
        <span
          aria-hidden
          className="w-[6px] h-[6px] rounded-full shrink-0"
          style={{ background: '#b25425' }}
        />
        <span>{switching ? br.switch.switching : br.switch.label}</span>
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
    );
  }

  return (
    <div className="flex items-center gap-2 text-[12px] whitespace-nowrap">
      <span className="font-sans text-[13px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--color-ink)]">
        {isLoading || !human ? '-' : formatUsdc(human, { withSuffix: false })}
      </span>
      <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
        USDC
      </span>
      <button
        type="button"
        onClick={() => copy(address)}
        title={copied ? br.address.copied : br.address.copyTitle.replace('{address}', address)}
        aria-label={br.address.copyAria.replace('{address}', address)}
        className="mono text-[10px] tabular-nums whitespace-nowrap text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-sm px-0.5 transition-colors"
      >
        {copied ? br.address.copied : shortAddress(address)}
      </button>
    </div>
  );
}
