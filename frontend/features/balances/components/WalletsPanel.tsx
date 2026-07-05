'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { LpHint } from '@/shared/components/LpHint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

type Overview = Awaited<ReturnType<typeof api.walletOverview>>;
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
          <p className="mt-1.5 flex items-center gap-1.5 font-sans text-[16px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
            {title}
            <LpHint>{purpose}</LpHint>
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
  }, [address]);

  useEffect(() => {
    refresh();
    // Live cadence: silent 5s refetch so the wallet balances track top-ups,
    // settlements, and the activation seed without a manual reload. Skip ticks
    // while the tab is hidden (and refresh on return) so a backgrounded tab
    // does not keep hitting the RPC, matching react-query's default behaviour.
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 5_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  if (!address) return null;

  const agents = data?.agents ?? null;

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

  return (
    <section style={CARD} className="p-6 md:p-8">
      <ul className="space-y-3">
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

        {/* The old Bridge wallet card was removed: Circle users now add money by
            connecting a wallet (one signature), so a separate source-chain
            deposit address here only confused people. */}
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
