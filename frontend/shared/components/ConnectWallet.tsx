'use client';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAuth } from '@/shared/hooks/useAuth';
import { LoginModal } from './LoginModal';
import { CircleAccountModal } from './CircleAccountModal';
import { ChainLogo, type ChainKey } from './ChainLogo';

/// Maps a wallet's current chain id to our branded ChainLogo key. Returns null
/// for chains we don't have a mark for (the pill then just omits the logo).
/// Arc testnet is 5042002.
function chainKeyFromId(id: number): ChainKey | null {
  switch (id) {
    case 5042002:
      return 'arc';
    case 84532:
      return 'baseSepolia';
    case 11155111:
      return 'sepolia';
    case 8453:
      return 'base';
    case 1:
      return 'ethereum';
    default:
      return null;
  }
}

/// Top-nav entry for authentication. Three rendered states:
///   1. Loading (auth status still resolving). hidden placeholder.
///   2. Authenticated via Circle (email + passkey). pill shows email +
///      a small "sign out" affordance.
///   3. Authenticated via web3. defers to RainbowKit's ConnectButton so
///      the wallet menu + chain switcher stay intact.
///   4. Not authenticated. a single "Log in" pill that opens LoginModal
///      with both paths visible.
export function ConnectWalletButton() {
  const auth = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // Backward-compat: old code referenced a single `open` state. Keep one
  // alias so the logged-out branch reads as before.
  const open = loginOpen;
  const setOpen = setLoginOpen;

  if (auth.isLoading) {
    return (
      <div
        aria-hidden
        className="inline-flex items-center px-3.5 py-1.5"
        style={{ opacity: 0, pointerEvents: 'none' }}
      >
        <span className="mono text-[11px]">…</span>
      </div>
    );
  }

  // Circle-session users: render our own pill since RainbowKit doesn't know
  // about them. Clicking opens our Karwan-styled account modal (copy address,
  // sign out). RainbowKit's account modal isn't reachable for these users.
  if (auth.method === 'circle' && auth.address) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          suppressHydrationWarning
          title={auth.email ?? auth.address}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mono text-[11px] tabular-nums text-[var(--color-ink)] whitespace-nowrap shrink-0 border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          {/* Circle wallets operate on Arc, so the chain mark is always Arc. */}
          <ChainLogo chain="arc" size={16} />
          <span
            aria-hidden
            className="w-[6px] h-[6px] rounded-full"
            style={{ background: 'var(--lp-accent)' }}
          />
          <span className="font-medium">
            {auth.email ? auth.email.split('@')[0] : shortAddr(auth.address)}
          </span>
        </button>
        <CircleAccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
      </>
    );
  }

  // Web3 users: keep RainbowKit's flow. it handles chain mismatch + wallet
  // menu out of the box. Only the disconnected slot is overridden to launch
  // our unified login modal instead of RainbowKit's wallet picker, so the
  // email path is visible alongside.
  return (
    <>
      <ConnectButton.Custom>
        {({ account, chain, openAccountModal, openChainModal, mounted }) => {
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
                      onClick={() => setOpen(true)}
                      type="button"
                      suppressHydrationWarning
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full mono text-[11px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden
                      >
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
                      Log in
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
                const chainKey = chainKeyFromId(chain.id);
                return (
                  <button
                    onClick={openAccountModal}
                    type="button"
                    suppressHydrationWarning
                    title={`On ${chain.name ?? 'unknown network'}. Tap to switch or manage.`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mono text-[11px] tabular-nums text-[var(--color-ink)] whitespace-nowrap shrink-0 border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
                  >
                    {/* Current chain mark; updates the moment the wallet switches
                        because RainbowKit re-renders this with the new chain. */}
                    {chainKey ? (
                      <ChainLogo chain={chainKey} size={16} />
                    ) : (
                      <span
                        aria-hidden
                        className="w-[6px] h-[6px] rounded-full"
                        style={{ background: '#0a7553' }}
                      />
                    )}
                    <span className="font-medium">{account.displayName}</span>
                  </button>
                );
              })()}
            </div>
          );
        }}
      </ConnectButton.Custom>
      <LoginModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
