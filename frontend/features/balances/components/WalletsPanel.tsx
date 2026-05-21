'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/core/api';

type Overview = Awaited<ReturnType<typeof api.walletOverview>>;
type BridgeStatus = Awaited<ReturnType<typeof api.bridgeWalletStatus>>;

const CARD = {
  background: 'var(--lp-card)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 5,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
} as const;

function fmt(v: string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function short(addr?: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

/// One wallet line: bracket tag, plain-English purpose, balance, optional action.
function Row({
  tag,
  hub,
  title,
  purpose,
  address,
  primary,
  secondary,
  action,
}: {
  tag: string;
  hub?: boolean;
  title: string;
  purpose: string;
  address?: string;
  primary: string;
  secondary?: string;
  action?: ReactNode;
}) {
  return (
    <li
      className="relative overflow-hidden px-5 py-4 pl-6"
      style={{
        background: 'var(--lp-light)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      {/* The identity wallet is the funding hub: give it the one lime rail. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: hub ? 'var(--lp-accent)' : 'var(--lp-border-light)' }}
      />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:{tag}:]
          </span>
          <p className="mt-1.5 font-sans text-[16px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
            {title}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-[var(--lp-text-sub)] max-w-[44ch]">
            {purpose}
          </p>
          {address && (
            <p className="mt-1.5 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {short(address)}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--lp-dark)]">
            {primary}
          </p>
          {secondary && (
            <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {secondary}
            </p>
          )}
          {action && <div className="mt-2">{action}</div>}
        </div>
      </div>
    </li>
  );
}

/// Plain-language map of the wallets in a Karwan account, with live balances and
/// the one action most users miss: refuelling the bridge wallet's source-chain
/// gas. Identity is the hub; agents are funded from it; the bridge wallet lives
/// on Base/Ethereum and needs ETH for gas. See [[karwan_wallet_model]].
export function WalletsPanel({ address }: { address?: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [refueling, setRefueling] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!address) return;
    api.walletOverview(address).then(setData).catch(() => {});
    api.bridgeWalletStatus(address, 'baseSepolia').then(setBridge).catch(() => setBridge(null));
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!address) return null;

  const agents = data?.agents ?? null;
  const bridgeAddr = bridge?.bridgeWalletAddress ?? data?.bridgeWallets?.['BASE-SEPOLIA']?.address;
  const gasLow = bridge?.gasBalance !== null && bridge?.gasBalance !== undefined && Number(bridge.gasBalance) <= 0;

  const topUpGas = async () => {
    setRefueling(true);
    setNote(null);
    try {
      await api.dripBridgeGas(address);
      setNote('Gas and USDC requested from the faucet. It lands in about a minute, then your bridge can run.');
      setTimeout(refresh, 8000);
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setRefueling(false);
    }
  };

  return (
    <section style={CARD} className="p-6 md:p-8">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:HOW YOUR WALLETS WORK:]
      </span>
      <h3 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none">
        One account, a few wallets
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[60ch]">
        Money flows faucet to your identity wallet, then out to your agents. On Arc, USDC is the
        gas, so only the bridge wallet needs ETH.
      </p>

      <ul className="mt-6 space-y-3">
        <Row
          tag="IDENTITY"
          hub
          title="Identity wallet"
          purpose="Your main wallet on Arc. Funded at sign-up. Everything else is funded from here."
          address={data?.identity.address}
          primary={`${fmt(data?.identity.usdcBalance)} USDC`}
        />

        {agents ? (
          <>
            <Row
              tag="BUYER AGENT"
              title="Buyer agent"
              purpose="Holds and escrows the USDC for deals you buy. Top it up in Agent treasury below."
              address={agents.buyer.address}
              primary={`${fmt(agents.buyer.usdcBalance)} USDC`}
            />
            <Row
              tag="SELLER AGENT"
              title="Seller agent"
              purpose="Pays the small Arc gas to accept and deliver on deals you sell. Top it up in Agent treasury below."
              address={agents.seller.address}
              primary={`${fmt(agents.seller.usdcBalance)} USDC`}
            />
          </>
        ) : (
          <li
            className="px-5 py-4 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            [:AGENTS NOT CREATED:] activate to create your buyer and seller agents.
          </li>
        )}

        {bridgeAddr && (
          <Row
            tag="BRIDGE WALLET"
            title="Bridge wallet"
            purpose="Brings USDC in from Base or Ethereum. It runs on that chain, so it needs a little ETH for gas, not Arc USDC."
            address={bridgeAddr}
            primary={`${fmt(bridge?.usdcBalance)} USDC`}
            secondary={`${fmt(bridge?.gasBalance)} ETH gas`}
            action={
              <button
                type="button"
                onClick={topUpGas}
                disabled={refueling}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.1em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
                style={{
                  borderTopLeftRadius: 9,
                  borderTopRightRadius: 9,
                  borderBottomLeftRadius: 9,
                  borderBottomRightRadius: 3,
                  boxShadow: '0 3px 0 rgba(0,0,0,0.2)',
                }}
              >
                {refueling ? 'Requesting' : gasLow ? 'Top up gas' : 'Refuel gas'}
                <span aria-hidden>→</span>
              </button>
            }
          />
        )}
      </ul>

      {note && (
        <p className="mt-4 px-3 py-2.5 text-[12px] leading-snug"
          style={{
            background: 'rgba(189, 225, 34,0.10)',
            color: 'var(--lp-dark)',
            border: '1px solid rgba(189, 225, 34,0.30)',
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 3,
          }}
        >
          {note}
        </p>
      )}
    </section>
  );
}
