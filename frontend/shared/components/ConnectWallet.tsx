'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const CORNERS = {
  borderTopLeftRadius: 9,
  borderTopRightRadius: 9,
  borderBottomLeftRadius: 9,
  borderBottomRightRadius: 2,
} as const;

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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.12em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0"
                    style={{
                      ...CORNERS,
                      boxShadow: '0 3px 0 rgba(0,0,0,0.22)',
                    }}
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
                    className="inline-flex items-stretch overflow-hidden mono text-[10px] font-bold uppercase tracking-[0.14em] leading-none text-white hover:opacity-95 transition-opacity"
                    style={{
                      background: 'var(--color-ink)',
                      ...CORNERS,
                      boxShadow: '0 2px 0 rgba(0,0,0,0.22)',
                    }}
                  >
                    <span
                      aria-hidden
                      className="flex items-center justify-center px-1.5"
                      style={{ background: '#b03d3a' }}
                    >
                      <span
                        aria-hidden
                        data-instrument-blink
                        className="inline-block w-[5px] h-[5px] bg-white"
                        style={{ animation: 'instrumentBlink 1.6s ease-in-out infinite' }}
                      />
                    </span>
                    <span className="px-2 py-[6px]">Wrong network</span>
                  </button>
                );
              }
              return (
                <button
                  onClick={openAccountModal}
                  type="button"
                  suppressHydrationWarning
                  className="inline-flex items-stretch overflow-hidden mono text-[11px] tabular-nums leading-none text-white whitespace-nowrap shrink-0 hover:opacity-95 transition-opacity"
                  style={{
                    background: 'var(--color-ink)',
                    ...CORNERS,
                    boxShadow: '0 2px 0 rgba(0,0,0,0.22)',
                  }}
                >
                  <span
                    aria-hidden
                    className="flex items-center justify-center px-1.5"
                    style={{ background: '#075e42' }}
                  >
                    <span
                      aria-hidden
                      data-instrument-blink
                      className="inline-block w-[5px] h-[5px] bg-white"
                      style={{ animation: 'instrumentBlink 1.6s ease-in-out infinite' }}
                    />
                  </span>
                  <span className="px-2.5 py-[7px] font-semibold">{account.displayName}</span>
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
