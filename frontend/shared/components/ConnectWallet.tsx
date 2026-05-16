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
                // Primary CTA — keeps the brand lime fill since this is the
                // strongest call-to-action on the navbar for disconnected users.
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    suppressHydrationWarning
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full mono text-[11px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <rect
                        x="2"
                        y="4"
                        width="12"
                        height="9"
                        rx="1.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M2 7h12M10 10h1"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
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
                    className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-full mono text-[10.5px] uppercase tracking-[0.10em] font-bold transition-colors hover:bg-[rgba(176,61,58,0.06)]"
                    style={{
                      background: 'var(--color-surface)',
                      color: '#b03d3a',
                      border: '1.5px solid #b03d3a',
                    }}
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mono text-[11px] tabular-nums text-[var(--color-ink)] whitespace-nowrap shrink-0 border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <span
                    aria-hidden
                    className="w-[6px] h-[6px] rounded-full"
                    style={{ background: '#0a7553' }}
                  />
                  <span className="font-medium">{account.displayName}</span>
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
