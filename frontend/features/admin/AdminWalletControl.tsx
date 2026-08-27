'use client';

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { arcTestnet } from '@/core/wagmi';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function AdminWalletControl() {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== arcTestnet.id;

  if (!isConnected || !address) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="hidden xl:block text-right">
          <p className="mono text-[9px] uppercase tracking-[0.16em] text-white/35">Signing wallet</p>
          <p className="mt-0.5 text-[11px] text-white/55">Separate from customer login</p>
        </div>
        {connectors.map((connector, index) => (
          <button
            key={connector.uid}
            type="button"
            onClick={() => connect({ connector })}
            disabled={isPending || status === 'connecting'}
            className={`min-h-11 rounded-lg border px-3 mono text-[10px] font-bold uppercase tracking-[0.11em] transition disabled:opacity-50 ${
              index === 0
                ? 'border-[#AFC95B] bg-[#AFC95B] text-[#0b0c0d] hover:bg-[#AFC95B]'
                : 'border-white/15 text-white/65 hover:border-white/30 hover:text-white'
            }`}
          >
            {isPending ? 'Connecting…' : connector.name === 'WalletConnect' ? 'Scan QR' : 'Connect wallet'}
          </button>
        ))}
        {error && <p className="w-full text-right text-[10px] text-[#e0794f]">Wallet connection was not completed.</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="text-right">
        <p className="mono text-[9px] uppercase tracking-[0.16em] text-white/35">Operator wallet</p>
        <p className="mt-0.5 font-mono text-[11px] text-white/80">{shortAddress(address)}</p>
      </div>
      {wrongChain ? (
        <button
          type="button"
          onClick={() => switchChain({ chainId: arcTestnet.id })}
          disabled={switching}
          className="min-h-11 rounded-lg border border-[#e0a24f]/50 bg-[#e0a24f]/10 px-3 mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#efbd78] disabled:opacity-50"
        >
          {switching ? 'Switching…' : 'Switch to Arc'}
        </button>
      ) : (
        <span className="inline-flex min-h-11 items-center rounded-lg border border-[#AFC95B]/35 bg-[#AFC95B]/10 px-3 mono text-[9px] uppercase tracking-[0.12em] text-[#AFC95B]">
          Arc ready
        </span>
      )}
      <button
        type="button"
        onClick={() => disconnect()}
        className="min-h-11 rounded-lg border border-white/15 px-3 mono text-[10px] uppercase tracking-[0.1em] text-white/55 transition hover:border-white/30 hover:text-white"
      >
        Disconnect
      </button>
    </div>
  );
}
