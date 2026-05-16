'use client';
import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAuth } from '@/shared/hooks/useAuth';
import { LoginModal } from './LoginModal';

/// Top-nav entry for authentication. Three rendered states:
///   1. Loading (auth status still resolving) — hidden placeholder.
///   2. Authenticated via Circle (email + passkey) — pill shows email +
///      a small "sign out" affordance.
///   3. Authenticated via web3 — defers to RainbowKit's ConnectButton so
///      the wallet menu + chain switcher stay intact.
///   4. Not authenticated — a single "Log in" pill that opens LoginModal
///      with both paths visible.
export function ConnectWalletButton() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);

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
  // about them. Includes a sign-out affordance.
  if (auth.method === 'circle' && auth.address) {
    return (
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          suppressHydrationWarning
          title={auth.email ?? auth.address}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mono text-[11px] tabular-nums text-[var(--color-ink)] whitespace-nowrap shrink-0 border border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          <span
            aria-hidden
            className="w-[6px] h-[6px] rounded-full"
            style={{ background: 'var(--lp-accent)' }}
          />
          <span className="font-medium">
            {auth.email ? auth.email.split('@')[0] : shortAddr(auth.address)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => auth.signOut()}
          title="Sign out"
          className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] transition-colors"
        >
          Sign out
        </button>
        <LoginModal open={open} onClose={() => setOpen(false)} />
      </div>
    );
  }

  // Web3 users: keep RainbowKit's flow — it handles chain mismatch + wallet
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
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full mono text-[11px] font-semibold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
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
      <LoginModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
