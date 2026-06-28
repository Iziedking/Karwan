'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

type Overview = Awaited<ReturnType<typeof api.walletOverview>>;
type BridgeStatus = Awaited<ReturnType<typeof api.bridgeWalletStatus>>;
type WalletsCopy = Messages['walletsPanel'];

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

/// Click-to-copy address line. Copies the FULL address (not the truncated
/// form) and flips the trailing label to a confirmation for ~1.5s so the user
/// sees the copy landed.
function CopyAddress({
  address,
  onCopied,
}: {
  address: string;
  onCopied?: (addr: string) => void;
}) {
  const wp = useTranslations().walletsPanel;
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(address);
      // The confirmation renders per-row under the action (see Row), so this
      // line is just the affordance; no local copied state to flip.
      onCopied?.(address);
    } catch {
      /* clipboard blocked; the address stays visible to copy by hand */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="mt-1.5 inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] transition-colors hover:text-[var(--lp-text-sub)]"
    >
      <span>{short(address)}</span>
      <span>{wp.copyAddress.idle}</span>
    </button>
  );
}

function Row({
  tag,
  hub,
  title,
  purpose,
  address,
  primary,
  secondary,
  action,
  copiedAddr,
  onCopied,
  copiedLabel,
}: {
  tag: string;
  hub?: boolean;
  title: string;
  purpose: string;
  address?: string;
  primary: string;
  secondary?: string;
  action?: ReactNode;
  copiedAddr?: string | null;
  onCopied?: (addr: string) => void;
  copiedLabel?: string;
}) {
  // This row's address was the one just copied (via the address line or its
  // Get USDC button). Drives the inline confirmation under the action.
  const copied = !!address && copiedAddr === address;
  return (
    <li
      className="relative overflow-hidden px-5 py-4 ps-6"
      style={{
        background: 'var(--lp-light)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <span
        aria-hidden
        className="absolute start-0 top-0 bottom-0 w-[3px]"
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
          {address && <CopyAddress address={address} onCopied={onCopied} />}
        </div>
        <div className="text-end shrink-0">
          <p className="font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.01em] text-[var(--lp-dark)]">
            {primary}
          </p>
          {secondary && (
            <p className="mt-0.5 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {secondary}
            </p>
          )}
          {action && <div className="mt-2">{action}</div>}
          {copied && (
            <p
              aria-live="polite"
              className="mt-1.5 mono text-[9px] font-bold uppercase tracking-[0.16em]"
              style={{ color: 'var(--lp-accent)' }}
            >
              {copiedLabel}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function FaucetButton({
  onClick,
  busy,
  copy,
}: {
  onClick: () => void;
  busy: boolean;
  copy: WalletsCopy['faucetButton'];
}) {
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
      {busy ? copy.busy : copy.idle}
    </button>
  );
}

export function WalletsPanel({ address }: { address?: string }) {
  const wp = useTranslations().walletsPanel;
  const { method } = useAuth();
  const isCircle = method === 'circle';
  const [data, setData] = useState<Overview | null>(null);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [refueling, setRefueling] = useState(false);
  const [faucetBusy, setFaucetBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The address most recently copied, so the matching row can flash a Copied
  // confirmation right under its action instead of a single panel-wide banner.
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const markCopied = useCallback((addr: string) => {
    setCopiedAddr(addr);
    window.setTimeout(() => setCopiedAddr((cur) => (cur === addr ? null : cur)), 1500);
  }, []);

  const refresh = useCallback(() => {
    if (!address) return;
    api.walletOverview(address).then(setData).catch(() => {});
    api.bridgeWalletStatus(address, 'baseSepolia').then(setBridge).catch(() => setBridge(null));
  }, [address]);

  useEffect(() => {
    refresh();
    // Live cadence: silent 5s refetch so the wallet balances track top-ups,
    // settlements, and the activation seed without a manual reload.
    const id = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!address) return null;

  const agents = data?.agents ?? null;
  const bridgeAddr = bridge?.bridgeWalletAddress ?? data?.bridgeWallets?.['BASE-SEPOLIA']?.address;

  const runFaucet = async (target: 'identity' | 'buyer' | 'seller') => {
    const addr =
      target === 'identity'
        ? data?.identity.address
        : target === 'buyer'
          ? agents?.buyer.address
          : agents?.seller.address;
    if (!addr) return;
    setFaucetBusy(target);
    setNote(null);
    try {
      await navigator.clipboard?.writeText(addr);
      // Confirmation shows per-row under this button (the markCopied chip), so
      // no panel-wide bottom banner for the copy.
      markCopied(addr);
    } catch {
      setNote(wp.notes.faucetFallbackTemplate.replace('{addr}', short(addr)));
    }
    window.open('https://faucet.circle.com', '_blank', 'noopener,noreferrer');
    setFaucetBusy(null);
  };

  const topUpGas = async (chain: 'baseSepolia' | 'sepolia') => {
    setRefueling(true);
    setNote(null);
    try {
      await api.dripBridgeGas(address, chain);
      const label = chain === 'sepolia' ? wp.chains.ethereumSepolia : wp.chains.baseSepolia;
      setNote(wp.notes.gasRequestedTemplate.replace('{chain}', label));
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
        {wp.eyebrow}
      </span>
      <h3 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none">
        {wp.headline}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[60ch]">
        {isCircle ? wp.intro.circle : wp.intro.web3}
      </p>

      <ul className="mt-6 space-y-3">
        <Row
          tag={wp.rows.identity.tag}
          hub
          title={wp.rows.identity.title}
          purpose={isCircle ? wp.rows.identity.purposeCircle : wp.rows.identity.purposeWeb3}
          address={data?.identity.address}
          primary={`${fmt(data?.identity.usdcBalance)} USDC`}
          copiedAddr={copiedAddr}
          onCopied={markCopied}
          copiedLabel={wp.copyAddress.copied}
          action={
            <FaucetButton
              onClick={() => runFaucet('identity')}
              busy={faucetBusy === 'identity'}
              copy={wp.faucetButton}
            />
          }
        />

        {agents ? (
          <>
            <Row
              tag={wp.rows.buyer.tag}
              title={wp.rows.buyer.title}
              purpose={wp.rows.buyer.purpose}
              address={agents.buyer.address}
              primary={`${fmt(agents.buyer.usdcBalance)} USDC`}
              copiedAddr={copiedAddr}
              onCopied={markCopied}
              copiedLabel={wp.copyAddress.copied}
              action={
                <FaucetButton
                  onClick={() => runFaucet('buyer')}
                  busy={faucetBusy === 'buyer'}
                  copy={wp.faucetButton}
                />
              }
            />
            <Row
              tag={wp.rows.seller.tag}
              title={wp.rows.seller.title}
              purpose={wp.rows.seller.purpose}
              address={agents.seller.address}
              primary={`${fmt(agents.seller.usdcBalance)} USDC`}
              copiedAddr={copiedAddr}
              onCopied={markCopied}
              copiedLabel={wp.copyAddress.copied}
              action={
                <FaucetButton
                  onClick={() => runFaucet('seller')}
                  busy={faucetBusy === 'seller'}
                  copy={wp.faucetButton}
                />
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
            {wp.agentsNotCreated}
          </li>
        )}

        {bridgeAddr && (
          <Row
            tag={wp.rows.bridge.tag}
            title={wp.rows.bridge.title}
            purpose={wp.rows.bridge.purpose}
            address={bridgeAddr}
            primary={`${fmt(bridge?.usdcBalance)} USDC`}
            copiedAddr={copiedAddr}
            onCopied={markCopied}
            copiedLabel={wp.copyAddress.copied}
            secondary={wp.rows.bridge.gasSecondaryTemplate.replace('{amount}', fmt(bridge?.gasBalance))}
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
                  {refueling ? wp.bridgeActions.requesting : wp.bridgeActions.topUpBase}
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
                  {wp.bridgeActions.ethereumGas}
                </button>
              </div>
            }
          />
        )}
      </ul>

      {note && (
        <p className="mt-4 px-3 py-2.5 text-[12px] leading-snug"
          style={{
            background: 'rgba(175, 201, 91,0.10)',
            color: 'var(--lp-dark)',
            border: '1px solid rgba(175, 201, 91,0.30)',
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
