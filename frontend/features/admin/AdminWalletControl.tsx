'use client';

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { arcChain } from '@/core/wagmi';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const BUTTON = 'inline-flex h-[30px] items-center rounded-md border border-[var(--d-line)] bg-[var(--d-button)] px-2.5 text-[13px] font-medium text-[var(--d-text)] transition hover:border-[var(--d-line-2)] disabled:opacity-50';

/// The wallet a teammate signs money moves with on the desk. It is separate
/// from any customer sign-in.
export function AdminWalletControl() {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== arcChain.id;

  if (!isConnected || !address) {
    return (
      <div className="flex items-center gap-2">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            type="button"
            title="The wallet you sign money moves with. Separate from any customer sign-in."
            onClick={() => connect({ connector })}
            disabled={isPending || status === 'connecting'}
            className={BUTTON}
          >
            {isPending ? 'Connecting' : connector.name === 'WalletConnect' ? 'Scan with a wallet' : 'Connect signing wallet'}
          </button>
        ))}
        {error && <span className="text-[12px] text-[var(--d-red)]">Not connected.</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span title={address} className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-[var(--d-line)] px-2.5 text-[12px] text-[var(--d-text-2)]">
        <span className="size-[7px] rounded-full" style={{ background: wrongChain ? 'var(--d-amber)' : 'var(--d-green)' }} />
        <span className="tabular-nums">{shortAddress(address)}</span>
      </span>
      {wrongChain && (
        <button type="button" onClick={() => switchChain({ chainId: arcChain.id })} disabled={switching} className={BUTTON}>
          {switching ? 'Switching' : 'Switch to Arc'}
        </button>
      )}
      <button type="button" onClick={() => disconnect()} className={BUTTON}>Disconnect</button>
    </div>
  );
}
