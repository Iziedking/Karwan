'use client';
import { useState } from 'react';
import { useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { shortAddress } from '@/shared/utils/format';
import { SOURCE_CHAINS } from '@/features/bridge/config';
import { arcTestnet } from '@/core/wagmi';
import { cn } from '@/shared/utils/cn';
import { ChainLogo, type ChainKey } from '@/shared/components/ChainLogo';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

// Arc (settlement) first, then the CCTP source chains we show a wallet balance
// for. Each key doubles as the ChainLogo key, so the row map stays simple.
//
// Listed explicitly rather than derived from SOURCE_CHAINS. CCTP now also covers
// Avalanche, Unichain, Sei, Sonic, World Chain and HyperEVM, but deriving from
// it would silently add six more per-chain RPC reads to this panel on every
// render, for chains a user almost never holds USDC on. Add a key here when a
// chain earns a permanent row.
type RowKey =
  | 'arc'
  | 'baseSepolia'
  | 'sepolia'
  | 'arbitrumSepolia'
  | 'optimismSepolia'
  | 'polygonAmoy';

const ROW_KEYS: RowKey[] = [
  'arc',
  'baseSepolia',
  'sepolia',
  'arbitrumSepolia',
  'optimismSepolia',
  'polygonAmoy',
];

const CHAIN_META: Record<RowKey, { name: string; sub: string; key: ChainKey }> = {
  arc: { name: 'Arc', sub: 'Testnet', key: 'arc' },
  baseSepolia: { name: 'Base', sub: 'Sepolia', key: 'baseSepolia' },
  sepolia: { name: 'Ethereum', sub: 'Sepolia', key: 'sepolia' },
  arbitrumSepolia: { name: 'Arbitrum', sub: 'Sepolia', key: 'arbitrumSepolia' },
  optimismSepolia: { name: 'Optimism', sub: 'Sepolia', key: 'optimismSepolia' },
  polygonAmoy: { name: 'Polygon', sub: 'Amoy', key: 'polygonAmoy' },
};

const CARD_STYLE = {
  background: 'var(--lp-card)',
  color: 'var(--lp-dark)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 5,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
} as const;

/// USDC balance for one address across Arc + every CCTP source chain. Native on
/// Arc (USDC is the gas token), ERC-20 USDC elsewhere. A fixed-arity custom hook
/// so the rules-of-hooks order never shifts across renders, and the per-view
/// boilerplate collapses to three calls. Reads are disabled when address is
/// undefined (wagmi skips the fetch), so buyer/seller tabs cost nothing until set.
/// No explicit return type: let inference carry the real useBalance data shape
/// (ReturnType<typeof useBalance> widens .data to {} on an unresolved generic).
function useChainBalances(address?: `0x${string}`) {
  return {
    arc: useBalance({ address, chainId: arcTestnet.id }),
    baseSepolia: useBalance({
      address,
      chainId: SOURCE_CHAINS.baseSepolia.chainId,
      token: SOURCE_CHAINS.baseSepolia.usdc,
    }),
    sepolia: useBalance({
      address,
      chainId: SOURCE_CHAINS.sepolia.chainId,
      token: SOURCE_CHAINS.sepolia.usdc,
    }),
    arbitrumSepolia: useBalance({
      address,
      chainId: SOURCE_CHAINS.arbitrumSepolia.chainId,
      token: SOURCE_CHAINS.arbitrumSepolia.usdc,
    }),
    optimismSepolia: useBalance({
      address,
      chainId: SOURCE_CHAINS.optimismSepolia.chainId,
      token: SOURCE_CHAINS.optimismSepolia.usdc,
    }),
    polygonAmoy: useBalance({
      address,
      chainId: SOURCE_CHAINS.polygonAmoy.chainId,
      token: SOURCE_CHAINS.polygonAmoy.usdc,
    }),
  };
}

type View = 'you' | 'buyer' | 'seller';

export function BalancesCard({
  buyerAgent,
  sellerAgent,
}: {
  buyerAgent?: string;
  sellerAgent?: string;
} = {}) {
  // Source of truth is the unified auth hook. covers both wagmi-connected
  // web3 users and Circle passkey/email users (their identity DCW address).
  // wagmi's useBalance() works against any address since it reads chain RPC,
  // so the rest of the card stays unchanged.
  const auth = useAuth();
  const address = auth.address as `0x${string}` | undefined;
  const [view, setView] = useState<View>('you');
  // The whole card folds shut by default, so a secondary breakdown (the same
  // holdings the wallet cards already show, spread across chains) never crowds
  // the page or exposes balances on a demo recording. One tap on the header
  // opens it. Not persisted: it resets on remount.
  const [open, setOpen] = useState(false);
  const bc = useTranslations().balancesCard;

  const buyer = (buyerAgent as `0x${string}` | undefined) ?? undefined;
  const seller = (sellerAgent as `0x${string}` | undefined) ?? undefined;

  const youBal = useChainBalances(address);
  const buyerBal = useChainBalances(buyer);
  const sellerBal = useChainBalances(seller);

  if (!auth.isAuthenticated || !address) {
    return (
      <div style={CARD_STYLE} className="p-6 h-full flex flex-col">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {bc.eyebrow}
        </span>
        <p className="mt-3 text-[14px] text-[var(--lp-text-sub)]">
          {bc.signedOutBody}
        </p>
      </div>
    );
  }

  const groups = {
    you: { address, bal: youBal },
    buyer: { address: buyer, bal: buyerBal },
    seller: { address: seller, bal: sellerBal },
  } as const;

  const active = groups[view];
  const tabs: Array<{ key: View; label: string; disabled?: boolean }> = [
    { key: 'you', label: bc.tabs.you },
    { key: 'buyer', label: bc.tabs.buyer, disabled: !buyer },
    { key: 'seller', label: bc.tabs.seller, disabled: !seller },
  ];

  const allBalances = [youBal, buyerBal, sellerBal].flatMap((g) => Object.values(g));
  const busy = allBalances.some((b) => b.isRefetching);
  const lastUpdated = Math.max(
    ...allBalances.map((b) => b.dataUpdatedAt).filter((t) => t > 0),
    0,
  );

  function refreshAll() {
    for (const b of allBalances) b.refetch();
  }

  const rows = ROW_KEYS.map((key) => {
    const q = active.bal[key];
    return { key, data: q.data, loading: q.isLoading };
  });

  return (
    <div style={CARD_STYLE} className="flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 text-start hover:bg-black/[0.015] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-t-[22px]"
      >
        <div className="min-w-0">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {bc.eyebrow}
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
            {bc.title}
          </h2>
          <p className="mt-1.5 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            {bc.chainCountTemplate.replace('{n}', String(rows.length))}
          </p>
        </div>
        <span
          aria-hidden
          className="mt-1 shrink-0 text-[var(--lp-text-muted)] transition-transform duration-300"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {!open && <div className="pb-2" />}

      {open && (
        <>
      <div className="px-6 pb-3">
        <div
          className="inline-flex p-1 gap-1"
          style={{
            background: 'var(--lp-light)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 9,
            borderTopRightRadius: 9,
            borderBottomLeftRadius: 9,
            borderBottomRightRadius: 2,
          }}
        >
          {tabs.map((t) => {
            const isActive = view === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => !t.disabled && setView(t.key)}
                disabled={t.disabled}
                className={cn(
                  'px-3 py-1 mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                  isActive
                    ? 'bg-[var(--lp-band-dark)] text-white'
                    : t.disabled
                      ? 'text-[var(--lp-text-muted)] opacity-50 cursor-not-allowed'
                      : 'text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]',
                )}
                style={{
                  borderTopLeftRadius: 7,
                  borderTopRightRadius: 7,
                  borderBottomLeftRadius: 7,
                  borderBottomRightRadius: 2,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="px-6">
        {rows.map((r, i) => {
          const m = CHAIN_META[r.key];
          const num =
            r.loading || !r.data ? null : Number(formatUnits(r.data.value, r.data.decimals));
          return (
            <li
              key={r.key}
              className={`flex items-center gap-3 py-3.5 ${
                i < rows.length - 1 ? 'border-b border-[var(--lp-border-light)]' : ''
              }`}
            >
              <ChainLogo chain={m.key} size={30} />
              <div className="flex-1 min-w-0">
                <p className="font-sans text-[14px] font-semibold tracking-[-0.01em] text-[var(--lp-dark)] leading-tight">
                  {m.name}
                </p>
                <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] mt-0.5">
                  {m.sub}
                </p>
              </div>
              <div className="text-end">
                <p className="font-sans text-[22px] font-extrabold tabular-nums tracking-[-0.025em] leading-none text-[var(--lp-dark)]">
                  {num === null ? '-' : <AnimatedNumber value={num} decimals={2} />}
                </p>
                <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mt-1">
                  USDC
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="px-6 py-3.5 border-t border-[var(--lp-border-light)] flex items-center justify-between gap-3">
        <p className="mono text-[11px] tabular-nums text-[var(--lp-text-muted)]">
          {active.address ? shortAddress(active.address) : bc.notConfigured}
        </p>
        <div className="flex items-center gap-3">
          {lastUpdated > 0 && (
            <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {bc.updatedTemplate.replace('{time}', timeAgo(lastUpdated, bc.timeAgo))}
            </p>
          )}
          <button
            type="button"
            onClick={refreshAll}
            disabled={busy}
            className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-full px-1.5 py-0.5"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden className={busy ? 'animate-spin motion-reduce:animate-none' : ''}>
              <path d="M14 8a6 6 0 1 1-1.76-4.24M14 3v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {busy ? bc.refreshing : bc.refresh}
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

function timeAgo(ts: number, copy: Messages['balancesCard']['timeAgo']): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return copy.justNow;
  if (s < 60) return copy.secondsTemplate.replace('{n}', String(s));
  const m = Math.floor(s / 60);
  if (m < 60) return copy.minutesTemplate.replace('{n}', String(m));
  const h = Math.floor(m / 60);
  return copy.hoursTemplate.replace('{n}', String(h));
}
