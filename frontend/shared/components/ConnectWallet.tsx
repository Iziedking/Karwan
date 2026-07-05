'use client';
import { useState, type ReactNode } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { arcTestnet } from '@/core/wagmi';
import { formatUsdc } from '@/shared/utils/format';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { LoginModal } from './LoginModal';
import { CircleAccountModal } from './CircleAccountModal';
import { ChainLogo, type ChainKey } from './ChainLogo';

/// Arc USDC balance for the signed-in identity, shown inside the account pill.
/// Replaces the standalone nav balance+address chip: the address was redundant
/// with the pill's name, so only the balance carries over, with an eye toggle
/// to hide it. lg-only so the nav never overflows on smaller screens (matching
/// the old chip). Reads Arc directly, so it is the same balance for Circle and
/// web3 identities regardless of the connected wallet's chain.
function NavBalance() {
  const bc = useTranslations().balancesCard;
  const auth = useAuth();
  const [hidden, setHidden] = useState(false);
  const { data, isLoading } = useBalance({
    address: auth.address as `0x${string}` | undefined,
    chainId: arcTestnet.id,
    query: { refetchInterval: 20_000 },
  });
  if (!auth.isAuthenticated || !auth.address) return null;
  const human = data ? formatUnits(data.value, data.decimals) : null;
  return (
    <span className="hidden lg:inline-flex items-center gap-1.5">
      <span className="font-sans text-[13px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--color-ink)]">
        {hidden ? '••••' : isLoading || !human ? '-' : formatUsdc(human, { withSuffix: false })}
      </span>
      <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
        USDC
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setHidden((v) => !v);
        }}
        aria-pressed={hidden}
        aria-label={hidden ? bc.reveal : bc.hide}
        className="inline-flex items-center justify-center text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-full transition-colors"
      >
        {hidden ? (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="1.75" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="1.75" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2.5 2.5l11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <span aria-hidden className="w-px h-4 bg-[var(--color-line)]" />
    </span>
  );
}

/// The account pill: the identity's Arc balance (with hide toggle) alongside a
/// name button that opens the account manager. One shape for all authed states
/// (Circle, web3 session-without-wallet, web3 connected) so the balance and
/// hide affordance are identical everywhere.
function IdentityPill({
  leading,
  name,
  title,
  onOpen,
}: {
  leading: ReactNode;
  name: string;
  title?: string;
  onOpen: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 ps-2.5 pe-2.5 py-1 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] whitespace-nowrap shrink-0 hover:bg-[var(--color-surface-2)] transition-colors">
      <NavBalance />
      <button
        type="button"
        onClick={onOpen}
        suppressHydrationWarning
        title={title}
        className="inline-flex items-center gap-1.5 mono text-[11px] tabular-nums text-[var(--color-ink)]"
      >
        {leading}
        <span className="font-medium max-w-[10ch] sm:max-w-[18ch] truncate">{name}</span>
      </button>
    </div>
  );
}

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
  const t = useTranslations().auth.walletPill;
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

  // Arc mark + live dot: the leading visual for the Circle and web3-session
  // identity pills, both of which resolve to an Arc identity address.
  const arcLeading = (
    <>
      <ChainLogo chain="arc" size={16} />
      <span
        aria-hidden
        className="w-[6px] h-[6px] rounded-full"
        style={{ background: 'var(--lp-accent)' }}
      />
    </>
  );

  // Circle-session users: render our own pill since RainbowKit doesn't know
  // about them. Clicking opens our Karwan-styled account modal (copy address,
  // sign out). RainbowKit's account modal isn't reachable for these users.
  if (auth.method === 'circle' && auth.address) {
    return (
      <>
        <IdentityPill
          leading={arcLeading}
          name={auth.email ? auth.email.split('@')[0] : shortAddr(auth.address)}
          title={auth.email ?? auth.address}
          onOpen={() => setAccountOpen(true)}
        />
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
                  // A backend session can outlive the wagmi connection: the
                  // karwan_session cookie persists after the wallet disconnects
                  // in this tab. The user is still signed in, so a lime "Sign in"
                  // pill reads as a failed login. Show their identity instead
                  // (click to manage or sign out); only offer the real sign-in
                  // pill when there is genuinely no session.
                  if (auth.isAuthenticated && auth.address) {
                    return (
                      <IdentityPill
                        leading={arcLeading}
                        name={auth.email ? auth.email.split('@')[0] : shortAddr(auth.address)}
                        title={auth.email ?? auth.address}
                        onOpen={() => setAccountOpen(true)}
                      />
                    );
                  }
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
                      {t.logIn}
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
                      {t.wrongNetwork}
                    </button>
                  );
                }
                const chainKey = chainKeyFromId(chain.id);
                return (
                  <IdentityPill
                    leading={
                      // Current chain mark; updates the moment the wallet
                      // switches because RainbowKit re-renders with the new chain.
                      chainKey ? (
                        <ChainLogo chain={chainKey} size={16} />
                      ) : (
                        <span
                          aria-hidden
                          className="w-[6px] h-[6px] rounded-full"
                          style={{ background: '#0a7553' }}
                        />
                      )
                    }
                    name={account.displayName}
                    title={t.networkTooltip.replace('{chain}', chain.name ?? t.fallbackChain)}
                    onOpen={openAccountModal}
                  />
                );
              })()}
            </div>
          );
        }}
      </ConnectButton.Custom>
      <LoginModal open={open} onClose={() => setOpen(false)} />
      {/* Account modal for the session-without-wallet case above (manage / sign
          out). The connected-wallet case uses RainbowKit's own account modal. */}
      <CircleAccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  );
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
