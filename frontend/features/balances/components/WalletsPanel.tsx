'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';

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

/// Small outline button that pulls testnet USDC from the faucet to a wallet.
function FaucetButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center justify-center px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.1em] border transition-colors disabled:opacity-50 hover:bg-black/[0.03]"
      style={{
        borderColor: 'var(--lp-border-light)',
        color: 'var(--lp-text-sub)',
        borderTopLeftRadius: 9,
        borderTopRightRadius: 9,
        borderBottomLeftRadius: 9,
        borderBottomRightRadius: 3,
      }}
    >
      {busy ? 'Requesting' : 'Faucet'}
    </button>
  );
}

/// Plain-language map of the wallets in a Karwan account, with live balances and
/// the one action most users miss: refuelling the bridge wallet's source-chain
/// gas. Identity is the hub; agents are funded from it; the bridge wallet lives
/// on Base/Ethereum and needs ETH for gas. See [[karwan_wallet_model]].
export function WalletsPanel({ address }: { address?: string }) {
  const { method } = useAuth();
  // Email / passkey accounts get Karwan-created, faucet-funded wallets; web3
  // users bring their own wallet as the identity and fund the agents themselves.
  const isCircle = method === 'circle';
  const [data, setData] = useState<Overview | null>(null);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [refueling, setRefueling] = useState(false);
  const [faucetBusy, setFaucetBusy] = useState<string | null>(null);
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

  const runFaucet = async (target: 'identity' | 'buyer' | 'seller') => {
    setFaucetBusy(target);
    setNote(null);
    try {
      await api.faucet(address, target);
      setNote('Faucet requested. About 20 USDC lands on Arc in a minute.');
      setTimeout(refresh, 8000);
    } catch (err) {
      const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : null;
      setNote(detail ?? (err as Error).message);
    } finally {
      setFaucetBusy(null);
    }
  };

  const topUpGas = async (chain: 'baseSepolia' | 'sepolia') => {
    setRefueling(true);
    setNote(null);
    try {
      await api.dripBridgeGas(address, chain);
      const label = chain === 'sepolia' ? 'Ethereum Sepolia' : 'Base Sepolia';
      setNote(`${label} gas and USDC requested. It lands in about a minute, then retry the bridge.`);
      if (chain === 'baseSepolia') setTimeout(refresh, 8000);
    } catch (err) {
      const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : null;
      setNote(detail ?? (err as Error).message);
    } finally {
      setRefueling(false);
    }
  };

  return (
    <section style={CARD} className="p-6 md:p-8">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:YOUR WALLETS:]
      </span>
      <h3 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none">
        One account. Several wallets
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[60ch]">
        {isCircle
          ? 'Created with your account. Funds settle into your identity wallet, then route to your agents. On Arc, USDC pays the gas, so only the bridge wallet holds ETH.'
          : 'Your connected wallet is your identity. Karwan provisions the agent and bridge wallets it runs for you, funded from it. On Arc, USDC pays the gas, so only the bridge wallet holds ETH.'}
      </p>

      <ul className="mt-6 space-y-3">
        <Row
          tag="IDENTITY"
          hub
          title="Identity wallet"
          purpose={
            isCircle
              ? 'Your account wallet on Arc, funded at sign-up. The hub every other wallet draws from.'
              : 'Your connected wallet, serving as your Arc identity. Fund the agents from here.'
          }
          address={data?.identity.address}
          primary={`${fmt(data?.identity.usdcBalance)} USDC`}
          action={
            isCircle ? (
              <FaucetButton onClick={() => runFaucet('identity')} busy={faucetBusy === 'identity'} />
            ) : undefined
          }
        />

        {agents ? (
          <>
            <Row
              tag="BUYER AGENT"
              title="Buyer agent"
              purpose="Escrows USDC for the deals you buy. Top up under Agent treasury."
              address={agents.buyer.address}
              primary={`${fmt(agents.buyer.usdcBalance)} USDC`}
              action={
                <FaucetButton onClick={() => runFaucet('buyer')} busy={faucetBusy === 'buyer'} />
              }
            />
            <Row
              tag="SELLER AGENT"
              title="Seller agent"
              purpose="Covers the Arc gas to accept and deliver on the deals you sell. Top up under Agent treasury."
              address={agents.seller.address}
              primary={`${fmt(agents.seller.usdcBalance)} USDC`}
              action={
                <FaucetButton onClick={() => runFaucet('seller')} busy={faucetBusy === 'seller'} />
              }
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
            [:AGENTS NOT CREATED:] Activate to provision your buyer and seller agents.
          </li>
        )}

        {bridgeAddr && (
          <Row
            tag="BRIDGE WALLET"
            title="Bridge wallet"
            purpose="Imports USDC from Base or Ethereum. It settles on that chain, so it holds ETH for gas, not Arc USDC."
            address={bridgeAddr}
            primary={`${fmt(bridge?.usdcBalance)} USDC`}
            secondary={`${fmt(bridge?.gasBalance)} ETH gas`}
            action={
              <div className="flex flex-col items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => topUpGas('baseSepolia')}
                  disabled={refueling}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.1em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
                  style={{
                    borderTopLeftRadius: 9,
                    borderTopRightRadius: 9,
                    borderBottomLeftRadius: 9,
                    borderBottomRightRadius: 3,
                    boxShadow: '0 3px 0 rgba(0,0,0,0.2)',
                  }}
                >
                  {refueling ? 'Requesting' : 'Top up Base gas'}
                </button>
                <button
                  type="button"
                  onClick={() => topUpGas('sepolia')}
                  disabled={refueling}
                  className="inline-flex items-center justify-center px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.1em] border transition-colors disabled:opacity-50"
                  style={{
                    borderColor: 'var(--lp-border-light)',
                    color: 'var(--lp-text-sub)',
                    borderTopLeftRadius: 9,
                    borderTopRightRadius: 9,
                    borderBottomLeftRadius: 9,
                    borderBottomRightRadius: 3,
                  }}
                >
                  Ethereum gas
                </button>
              </div>
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
