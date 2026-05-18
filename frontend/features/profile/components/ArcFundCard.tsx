'use client';
import { useEffect, useRef, useState } from 'react';
import { useBalance, useChainId, useSwitchChain } from 'wagmi';
import { formatUnits } from 'viem';
import { cn } from '@/shared/utils/cn';
import { CopyAddress } from '@/shared/components/CopyAddress';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { ARC_CHAIN_ID, ARC_EXPLORER_TX } from '../config';
import { useArcFund, type FundPhase, type FundRecord } from '../hooks/useArcFund';
import { useCircleFund, type CircleFundRecord } from '../hooks/useCircleFund';
import { useAuth } from '@/shared/hooks/useAuth';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';

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

const TONE_COLOR = {
  positive: '#0a7553',
  critical: '#b03d3a',
  live: 'var(--lp-accent)',
  warning: '#b25425',
} as const;

function formatBalance(data: { value: bigint; decimals: number } | undefined): string {
  if (!data) return '-';
  return formatUsdc(formatUnits(data.value, data.decimals), { withSuffix: false });
}

interface AgentOption {
  key: 'buyer' | 'seller';
  label: string;
  address?: string;
}

export function ArcFundCard({
  buyerAgent,
  sellerAgent,
  defaultAgent = 'buyer',
}: {
  buyerAgent?: string;
  sellerAgent?: string;
  defaultAgent?: 'buyer' | 'seller';
}) {
  const auth = useAuth();
  const address = auth.address as `0x${string}` | undefined;
  const isConnected = auth.isAuthenticated;
  const isCircleUser = auth.method === 'circle';
  // wagmi-reported chain of the connected EIP-1193 wallet. For Circle-only
  // users this defaults to whatever wagmi has (often the wagmi default chain
  // even when no wallet is connected), so we only read it for web3 users.
  const walletChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const onWrongChain = !isCircleUser && isConnected && walletChainId !== ARC_CHAIN_ID;
  // Balance reads target Arc directly via the wagmi public RPC, not the
  // wallet, so they remain accurate even when the wallet is on another chain.
  const arcBalance = useBalance({ address, chainId: ARC_CHAIN_ID });
  const buyerArcBalance = useBalance({
    address: (buyerAgent as `0x${string}`) || undefined,
    chainId: ARC_CHAIN_ID,
  });
  const sellerArcBalance = useBalance({
    address: (sellerAgent as `0x${string}`) || undefined,
    chainId: ARC_CHAIN_ID,
  });
  // Two completely separate fund flows: wagmi-signed native transfer on Arc
  // for web3 users, server-side Circle DCW transfer for Circle users. Both
  // hooks expose the same record shape, so the activity list below is shared.
  const wagmiFund = useArcFund();
  const circleFund = useCircleFund(address);
  const records = isCircleUser ? circleFund.records : wagmiFund.records;
  const start = isCircleUser ? circleFund.start : wagmiFund.start;
  const retry = isCircleUser ? circleFund.retry : wagmiFund.retry;
  const dismiss = isCircleUser ? circleFund.dismiss : wagmiFund.dismiss;

  function refetchAll() {
    arcBalance.refetch();
    buyerArcBalance.refetch();
    sellerArcBalance.refetch();
  }

  const lastDoneIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const r of records) {
      if (r.phase === 'done' && !lastDoneIds.current.has(r.id)) {
        lastDoneIds.current.add(r.id);
        refetchAll();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const refreshing =
    arcBalance.isRefetching || buyerArcBalance.isRefetching || sellerArcBalance.isRefetching;

  const [, setTick] = useState(0);
  const hasLive = records.some(
    (r) =>
      r.phase === 'switching' ||
      r.phase === 'signing' ||
      r.phase === 'confirming' ||
      r.phase === 'sending',
  );
  useEffect(() => {
    if (!hasLive) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasLive]);

  const options: AgentOption[] = [
    { key: 'buyer', label: 'Buyer agent', address: buyerAgent },
    { key: 'seller', label: 'Seller agent', address: sellerAgent },
  ];

  const [selected, setSelected] = useState<'buyer' | 'seller'>(defaultAgent);
  useEffect(() => {
    if (!buyerAgent && sellerAgent) setSelected('seller');
    else if (buyerAgent && !sellerAgent) setSelected('buyer');
  }, [buyerAgent, sellerAgent]);

  const [amount, setAmount] = useState<number | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const selectedAgent = options.find((o) => o.key === selected);

  const activeCount = records.filter(
    (r) =>
      r.phase === 'switching' ||
      r.phase === 'signing' ||
      r.phase === 'confirming' ||
      r.phase === 'sending',
  ).length;
  const hasActiveTransfer = activeCount > 0;

  const canSubmit =
    isConnected &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!selectedAgent?.address &&
    !hasActiveTransfer &&
    !isSwitching;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedAgent?.address) return;
    // On wrong chain, switch only. Don't try to submit the transfer.
    // wagmi's wallet client needs the switch to actually commit before any
    // signing call will be routed to the new chain, otherwise the tx fires
    // on the old chain and reverts. After the switch lands, walletChainId
    // updates -> onWrongChain flips false -> the button label turns into
    // "Send to buyer agent" and the next click does the actual transfer.
    if (onWrongChain) {
      try {
        await switchChainAsync({ chainId: ARC_CHAIN_ID });
      } catch {
        // User declined the wallet prompt. Stay on the same button so they
        // can try again. No banner; the wallet's own toast surfaces it.
      }
      return;
    }
    start({
      agentKey: selected,
      agentAddress: selectedAgent.address as `0x${string}`,
      amountUsdc: amount as number,
    });
  }

  const arcHuman =
    arcBalance.data && !arcBalance.isLoading
      ? formatUnits(arcBalance.data.value, arcBalance.data.decimals)
      : null;

  return (
    <section
      style={CARD_STYLE}
      className="p-6 md:p-8 h-full min-w-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:FUND AGENT:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
            Top up on Arc
          </h2>
          <p className="mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {isCircleUser ? 'One click Â· backend signs' : 'Single tx Â· settles in ~3s'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeCount > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 mono text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{
                background: 'rgba(189, 225, 34,0.10)',
                color: 'var(--lp-dark)',
                border: '1px solid rgba(189, 225, 34,0.35)',
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              <span className="relative flex size-1.5">
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
                  style={{ background: 'var(--lp-accent)' }}
                />
                <span
                  className="relative inline-flex size-1.5 rounded-full"
                  style={{ background: 'var(--lp-accent)' }}
                />
              </span>
              {activeCount} IN FLIGHT
            </span>
          )}
          <button
            type="button"
            onClick={refetchAll}
            disabled={refreshing}
            title="Refresh balances"
            className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''}
            >
              <path
                d="M14 8a6 6 0 1 1-1.76-4.24M14 3v3h-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-1 flex-col gap-5">
        {/* RECIPIENT PICKER */}
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:RECIPIENT:]
          </span>
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((o) => {
              const active = selected === o.key;
              const disabled = !o.address;
              const bal = o.key === 'buyer' ? buyerArcBalance : sellerArcBalance;
              const balHuman = bal.data && !bal.isLoading ? formatBalance(bal.data) : null;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => o.address && setSelected(o.key)}
                  disabled={disabled}
                  aria-pressed={active}
                  className={cn(
                    'relative overflow-hidden text-left p-4 transition-colors text-[var(--lp-dark)]',
                    !active && !disabled && 'hover:-translate-y-0.5',
                  )}
                  style={{
                    background: active
                      ? 'rgba(189, 225, 34,0.10)'
                      : disabled
                        ? 'var(--lp-light)'
                        : 'var(--lp-card)',
                    border: active
                      ? '1px solid var(--lp-accent)'
                      : '1px solid var(--lp-border-light)',
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    borderTopLeftRadius: 12,
                    borderTopRightRadius: 12,
                    borderBottomLeftRadius: 12,
                    borderBottomRightRadius: 3,
                    boxShadow: active ? '0 1px 0 rgba(189, 225, 34,0.18)' : 'none',
                  }}
                >
                  {active && (
                    <>
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-[3px]"
                        style={{ background: 'var(--lp-accent)' }}
                      />
                      <span
                        aria-hidden
                        data-instrument-blink
                        className="absolute top-2.5 right-2.5 inline-block w-[6px] h-[6px]"
                        style={{
                          background: 'var(--lp-accent)',
                          animation: 'instrumentBlink 1.6s ease-in-out infinite',
                        }}
                      />
                    </>
                  )}
                  <div className="flex items-center gap-2.5">
                    <WalletAvatar address={o.address ?? '0x0'} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold tracking-[-0.01em] leading-tight">
                        {o.label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="mono text-[10px] tabular-nums truncate text-[var(--lp-text-muted)]">
                          {o.address ? shortAddress(o.address) : 'not configured'}
                        </span>
                        {o.address && <CopyAddress value={o.address} />}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 flex items-baseline justify-between gap-2 border-t border-[var(--lp-border-light)]">
                    <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                      Balance
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-sans text-[15px] font-extrabold tabular-nums tracking-[-0.01em] leading-none">
                        {o.address ? (balHuman ?? '-') : '-'}
                      </span>
                      <span className="mono text-[9px] uppercase tracking-[0.14em] leading-none text-[var(--lp-text-muted)]">
                        USDC
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* AMOUNT */}
        <div
          className="fund-amount transition-shadow p-5"
          style={{
            background: 'var(--lp-light)',
            border: '1px solid var(--lp-border-light)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          <div className="flex items-baseline justify-between">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:AMOUNT:]
            </span>
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              Arc Â·{' '}
              {arcHuman ? `${formatUsdc(arcHuman, { withSuffix: false })} USDC available` : '-'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              className="no-spinner flex-1 bg-transparent font-sans text-[34px] font-extrabold tracking-[-0.025em] tabular-nums focus:outline-none placeholder:text-[var(--lp-text-muted)] text-[var(--lp-dark)] min-w-0"
              placeholder="0"
            />
            <span
              className="inline-flex items-center gap-1.5 bg-[var(--lp-card)] px-3 py-1.5"
              style={{
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 2,
              }}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
              <span className="mono text-[11px] font-bold uppercase tracking-[0.12em]">USDC</span>
            </span>
          </div>
          <style jsx>{`
            .fund-amount:focus-within {
              border-color: var(--lp-dark);
              box-shadow: 0 0 0 3px rgba(189, 225, 34, 0.25);
            }
          `}</style>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="group mt-auto w-full inline-flex items-center justify-center gap-2 px-5 py-4 mono text-[13px] font-bold uppercase tracking-[0.08em] transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
          style={{
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 4,
            boxShadow: canSubmit ? '0 4px 0 rgba(0,0,0,0.22)' : 'none',
          }}
        >
          {!isConnected ? (
            'Sign in to fund'
          ) : isSwitching ? (
            'Switching to Arc...'
          ) : hasActiveTransfer ? (
            'Transfer in progress...'
          ) : (
            <>
              <span>
                {onWrongChain
                  ? 'Switch to Arc'
                  : `Send to ${selectedAgent?.label.toLowerCase() ?? 'agent'}`}
              </span>
              <span
                aria-hidden
                className="inline-flex transition-transform group-hover:translate-x-0.5"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </>
          )}
        </button>
        {hasActiveTransfer && (
          <p className="text-[11px] text-[var(--lp-text-muted)] leading-snug">
            One transfer at a time. Native transfers settle in nonce order.
          </p>
        )}
      </form>

      {records.length > 0 && (
        <div className="mt-7 pt-5 border-t border-[var(--lp-border-light)]">
          <div className="flex items-baseline justify-between mb-3.5">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:ACTIVITY:]
            </span>
            <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              {records.length} {records.length === 1 ? 'TRANSFER' : 'TRANSFERS'}
            </p>
          </div>
          <ul className="space-y-2">
            {records.map((r) => (
              <FundRow
                key={r.id}
                record={r}
                expanded={expandedId === r.id}
                onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onRetry={() => retry(r.id)}
                onDismiss={() => dismiss(r.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type AnyFundPhase = FundPhase | 'sending';

function phaseLabel(phase: AnyFundPhase): string {
  switch (phase) {
    case 'switching':
      return 'Switching to Arc';
    case 'signing':
      return 'Sign in wallet';
    case 'confirming':
      return 'Confirming on Arc';
    case 'sending':
      return 'Transferring on Arc';
    case 'done':
      return 'Sent';
    case 'error':
      return 'Failed';
  }
}

function phaseTone(phase: AnyFundPhase): 'live' | 'positive' | 'critical' {
  if (phase === 'done') return 'positive';
  if (phase === 'error') return 'critical';
  return 'live';
}

function elapsed(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function FundRow({
  record,
  expanded,
  onToggle,
  onRetry,
  onDismiss,
}: {
  record: FundRecord | CircleFundRecord;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const tone = phaseTone(record.phase);
  const elapsedSec = Math.max(0, Math.floor((Date.now() - record.startedAt) / 1000));
  const inFlightConfirming =
    record.phase === 'confirming' || record.phase === 'sending';
  const isSlow = inFlightConfirming && elapsedSec > 15;
  const isStuck = inFlightConfirming && elapsedSec > 120;
  const canRetry = record.phase === 'error' || isStuck;
  const canDismiss = record.phase === 'done' || record.phase === 'error' || isStuck;
  const textColor =
    tone === 'positive'
      ? TONE_COLOR.positive
      : tone === 'critical'
        ? TONE_COLOR.critical
        : 'var(--lp-text-sub)';
  const railColor =
    tone === 'positive'
      ? TONE_COLOR.positive
      : tone === 'critical'
        ? TONE_COLOR.critical
        : 'var(--lp-accent)';
  return (
    <li
      className="relative overflow-hidden transition-shadow"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
        boxShadow: expanded
          ? '0 1px 0 rgba(0,0,0,0.04), 0 10px 28px -14px rgba(0,0,0,0.22)'
          : '0 1px 0 rgba(0,0,0,0.03), 0 6px 18px -14px rgba(0,0,0,0.14)',
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: railColor }}
      />
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 pl-4 flex items-center gap-3"
      >
        <WalletAvatar address={record.agentAddress} size={26} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-sans text-[17px] font-extrabold tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(record.amountUsdc, { withSuffix: false })}
            </span>
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-none">
              â†’ {record.agentKey}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <PhaseLED tone={tone} />
            <span
              className="text-[11px] font-medium leading-none"
              style={{ color: textColor }}
            >
              {phaseLabel(record.phase)}
            </span>
            <span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-muted)] leading-none">
              Â· {elapsed(record.startedAt)}
            </span>
            {isSlow && (
              <span
                className="text-[10px] mono uppercase tracking-[0.14em] leading-none px-1.5 py-0.5 font-bold"
                style={{
                  background: 'rgba(178,84,37,0.10)',
                  color: TONE_COLOR.warning,
                  border: '1px solid rgba(178,84,37,0.30)',
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  borderBottomLeftRadius: 4,
                  borderBottomRightRadius: 2,
                }}
              >
                SLOW
              </span>
            )}
          </div>
        </div>
        {record.txHash && (
          <a
            href={ARC_EXPLORER_TX(record.txHash)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 mono text-[10px] tabular-nums text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] px-2 py-1 shrink-0 transition-colors"
            style={{
              background: 'var(--lp-card)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 2,
            }}
            title="View on Arcscan"
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M5.5 4.5h6v6M11 5l-6.5 6.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            {shortHash(record.txHash)}
          </a>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className={cn(
            'text-[var(--lp-text-muted)] transition-transform shrink-0',
            expanded && 'rotate-180',
          )}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[var(--lp-border-light)] px-3 py-3 space-y-3">
          {record.error && (
            <div
              className="overflow-hidden"
              style={{
                background: 'var(--lp-card)',
                border: `1px solid ${TONE_COLOR.critical}`,
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
                boxShadow: '0 1px 0 rgba(176,61,58,0.18)',
              }}
            >
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5"
                style={{ background: TONE_COLOR.critical }}
              >
                <span aria-hidden className="inline-block w-[5px] h-[5px] bg-white" />
                <span className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-white">
                  ERROR
                </span>
              </div>
              <p className="px-3 py-2.5 text-[13px] leading-snug text-[var(--lp-dark)]">
                {record.error}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[11px] text-[var(--lp-text-sub)]">
              <span className="mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                Recipient
              </span>
              <span className="mono tabular-nums">{shortAddress(record.agentAddress)}</span>
            </div>
            {record.txHash && (
              <a
                href={ARC_EXPLORER_TX(record.txHash)}
                target="_blank"
                rel="noreferrer"
                className="flex items-baseline justify-between gap-3 text-[11px] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors"
              >
                <span className="mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                  Tx Â· Arc
                </span>
                <span className="mono inline-flex items-center gap-1 tabular-nums">
                  {shortHash(record.txHash)}
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M5.5 4.5h6v6M11 5l-6.5 6.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </a>
            )}
          </div>

          {isStuck && (
            <p className="text-[11px] text-[var(--lp-text-muted)] leading-snug">
              This transfer has not confirmed in a while. Likely a dropped tx. Retry to send a
              fresh one, or dismiss it.
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
                style={{
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 2,
                }}
              >
                Retry
              </button>
            )}
            {canDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-1.5 mono text-[11px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-card)] transition-colors rounded"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function PhaseLED({ tone }: { tone: 'live' | 'positive' | 'critical' }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      aria-hidden
      data-instrument-blink={tone === 'live' || undefined}
      className="shrink-0 inline-block w-[6px] h-[6px]"
      style={{
        background: color,
        animation: tone === 'live' ? 'instrumentBlink 1.6s ease-in-out infinite' : undefined,
      }}
    />
  );
}
