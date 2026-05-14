'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function ConnectWalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    suppressHydrationWarning
                    className="px-3.5 py-1.5 rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)] text-[12px] font-semibold hover:bg-[var(--lp-accent-hover)] transition-colors inline-flex items-center gap-1.5"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M2 7h12M10 10h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Connect wallet
                  </button>
                );
              }
              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    type="button"
                    suppressHydrationWarning
                    style={{ backgroundColor: '#e5484d', color: '#ffffff' }}
                    className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold hover:opacity-90 transition-opacity"
                  >
                    Wrong network
                  </button>
                );
              }
              return (
                <button
                  onClick={openAccountModal}
                  type="button"
                  suppressHydrationWarning
                  className="px-3.5 py-1.5 rounded-full border border-[var(--color-line-strong)] text-[12px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] transition-colors inline-flex items-center gap-2 mono"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive)]" />
                  {account.displayName}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
