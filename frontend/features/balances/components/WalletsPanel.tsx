'use client';
import { MoneyValue } from '@/shared/components/Money';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { LpHint } from '@/shared/components/LpHint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

type Overview = Awaited<ReturnType<typeof api.walletOverview>>;
type WalletsCopy = Messages['walletsPanel'];

function fmt(v: string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function short(addr?: string): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

function WalletGlyph({ kind }: { kind: 'identity' | 'agent' }) {
  return (
    <span
      aria-hidden
      className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-text-sub)] shadow-[0_8px_20px_-16px_rgba(16,15,14,0.45)]"
    >
      {kind === 'identity' ? (
        <svg viewBox="0 0 32 32" className="h-[23px] w-[23px]" fill="none">
          <path d="M6.25 10.25h17.5A2.75 2.75 0 0 1 26.5 13v10a2.75 2.75 0 0 1-2.75 2.75H7.5A3.5 3.5 0 0 1 4 22.25v-13A3.5 3.5 0 0 1 7.5 5.75h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 15.25h5.5v5.5H21a2.75 2.75 0 1 1 0-5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="21.4" cy="18" r=".9" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 32 32" className="h-[24px] w-[24px]" fill="none">
          <circle cx="11" cy="20.5" r="6.25" stroke="currentColor" strokeWidth="1.8" />
          <path d="m15.4 16.1 9.85-9.85M21.25 10.25l2.5 2.5M24 7.5l2.5 2.5M8.8 20.5h4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M25.35 4.6 27.4 6.65" stroke="var(--lp-accent)" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

/// Click-to-copy address line. Copies the FULL address (not the truncated
/// form) and flips the trailing label to a confirmation for ~1.5s so the user
/// sees the copy landed.
function CopyAddress({
  address,
  copied,
  onCopied,
}: {
  address: string;
  copied: boolean;
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
      aria-label={copied ? wp.copyAddress.copied : wp.copyAddress.idle}
      title={copied ? wp.copyAddress.copied : wp.copyAddress.idle}
      className="group mt-1 inline-flex max-w-full items-center gap-2 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] transition-colors hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
    >
      <span className="truncate">{short(address)}</span>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border border-transparent transition-[border-color,background,color] group-hover:border-[var(--lp-border-light)] group-hover:bg-[var(--lp-card)]">
        {copied ? (
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
            <path d="m5.25 10.25 3 3 6.5-7" stroke="var(--lp-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
            <rect x="6.25" y="4.25" width="9.5" height="10.5" rx="1.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13.75 15.75H5.5a1.25 1.25 0 0 1-1.25-1.25V7.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </span>
    </button>
  );
}

function Row({
  tag,
  title,
  purpose,
  address,
  primary,
  secondary,
  action,
  copiedAddr,
  onCopied,
  copiedLabel,
  walletKind,
}: {
  tag: string;
  title: string;
  purpose: string;
  address?: string;
  primary: string;
  secondary?: string;
  action?: ReactNode;
  copiedAddr?: string | null;
  onCopied?: (addr: string) => void;
  copiedLabel?: string;
  walletKind: 'identity' | 'agent';
}) {
  // This row's address was the one just copied (via the address line or its
  // Get USDC button). Drives the inline confirmation under the action.
  const copied = !!address && copiedAddr === address;
  return (
    <li
      className="relative overflow-hidden px-3.5 py-3.5 ps-5 sm:px-4"
      style={{
        background: 'var(--lp-light)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 3,
      }}
    >
      <span
        aria-hidden
        className="absolute start-0 top-0 bottom-0 w-[3px]"
        // Lime on all three: each one holds a balance, and the edge is what
        // marks a surface as money across the app. Reserving it for the hub made
        // the agent wallets read as labels rather than as money.
        style={{ background: 'var(--lp-accent)' }}
      />
      {/* Stack below sm, two columns above it. NOT flex-wrap.
          With wrapping, whether the balance sat beside the name or under it
          depended on how wide that particular card's title and address happened
          to be: "Identity wallet" pushed it to a second line while "Buyer agent"
          did not, so on a phone the three cards in one list rendered in two
          different shapes off the same component. A breakpoint decides it now,
          so every card in the list agrees at every width. */}
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <WalletGlyph kind={walletKind} />
          <div className="min-w-0">
            <span className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:{tag}:]
            </span>
            <p className="mt-0.5 flex items-center gap-1.5 font-sans text-[15px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
              {title}
              <LpHint>{purpose}</LpHint>
            </p>
            {address && <CopyAddress address={address} copied={copied} onCopied={onCopied} />}
          </div>
        </div>
        {/* Left-aligned while stacked, right-aligned once it is a column. A
            fixed text-end looked centred-ish and arbitrary on a phone, because
            the wrapped block hugs its content rather than filling the row. */}
        <div className="shrink-0 text-start sm:text-end">
          <MoneyValue value={primary} size="sm" />
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

  // Tightened so all three wallets and the holdings row are visible together.
  // This section already sits inside a deck card, so the old p-8 plus a 3-unit gap
  // between rows was a second frame's worth of air, and the third wallet fell
  // below the fold.
  return (
    <section>
      <ul className="space-y-2.5">
        <Row
          walletKind="identity"
          tag={wp.rows.identity.tag}
          title={wp.rows.identity.title}
          purpose={isCircle ? wp.rows.identity.purposeCircle : wp.rows.identity.purposeWeb3}
          address={data?.identity.address}
          primary={fmt(data?.identity.usdcBalance)}
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
              walletKind="agent"
              tag={wp.rows.buyer.tag}
              title={wp.rows.buyer.title}
              purpose={wp.rows.buyer.purpose}
              address={agents.buyer.address}
              primary={fmt(agents.buyer.usdcBalance)}
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
              walletKind="agent"
              tag={wp.rows.seller.tag}
              title={wp.rows.seller.title}
              purpose={wp.rows.seller.purpose}
              address={agents.seller.address}
              primary={fmt(agents.seller.usdcBalance)}
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
