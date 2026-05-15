'use client';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { cn } from '@/shared/utils/cn';
import { Note } from '@/shared/components/AppUI';
import { CopyAddress } from '@/shared/components/CopyAddress';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { ARC_CHAIN_ID, ARC_EXPLORER_TX } from '../config';
import { useArcFund, type FundPhase, type FundRecord } from '../hooks/useArcFund';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';

function formatBalance(data: { value: bigint; decimals: number } | undefined): string {
  if (!data) return '—';
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
  const { address, isConnected } = useAccount();
  const arcBalance = useBalance({ address, chainId: ARC_CHAIN_ID });
  const buyerArcBalance = useBalance({
    address: (buyerAgent as `0x${string}`) || undefined,
    chainId: ARC_CHAIN_ID,
  });
  const sellerArcBalance = useBalance({
    address: (sellerAgent as `0x${string}`) || undefined,
    chainId: ARC_CHAIN_ID,
  });
  const { records, start, retry, dismiss } = useArcFund();

  function refetchAll() {
    arcBalance.refetch();
    buyerArcBalance.refetch();
    sellerArcBalance.refetch();
  }

  // Refetch agent balances when a transfer transitions to 'done'.
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

  // 1Hz tick while any record is live so elapsed time and slow-hint render fresh.
  const [, setTick] = useState(0);
  const hasLive = records.some(
    (r) => r.phase === 'switching' || r.phase === 'signing' || r.phase === 'confirming',
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
  // If only one agent is configured, force-select it.
  useEffect(() => {
    if (!buyerAgent && sellerAgent) setSelected('seller');
    else if (buyerAgent && !sellerAgent) setSelected('buyer');
  }, [buyerAgent, sellerAgent]);

  const [amount, setAmount] = useState<number | ''>(5);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const selectedAgent = options.find((o) => o.key === selected);

  // Native transfers from one wallet are nonce-sequential, so a second one
  // fired while the first is pending just queues behind it, and if the first
  // stalls they all stall. Only one transfer may be in flight at a time.
  const activeCount = records.filter(
    (r) => r.phase === 'switching' || r.phase === 'signing' || r.phase === 'confirming',
  ).length;
  const hasActiveTransfer = activeCount > 0;

  const canSubmit =
    isConnected &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!selectedAgent?.address &&
    !hasActiveTransfer;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedAgent?.address) return;
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
    <section className="rounded-[28px] bg-[var(--lp-card)] text-[var(--lp-dark)] p-5 md:p-9 h-full flex flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-sans text-[22px] md:text-[24px] font-bold tracking-[-0.02em]">
            Fund agent on Arc
          </h2>
          <p className="mt-1 mono text-[12px] text-[var(--lp-text-sub)]">
            direct USDC transfer · single tx · settles in ~3s
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lp-light)] px-2.5 py-1 text-[11px] font-medium text-[var(--lp-dark)]">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--lp-accent)] opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[var(--lp-accent)]" />
              </span>
              {activeCount} in flight
            </span>
          )}
          <button
            type="button"
            onClick={refetchAll}
            disabled={refreshing}
            title="Refresh balances"
            className="inline-flex items-center gap-1.5 text-[12px] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              className={refreshing ? 'animate-spin' : ''}
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
        <div>
          <p className="mb-2 text-[12px] font-medium text-[var(--lp-text-sub)]">Recipient</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  className={cn(
                    'relative text-left p-4 rounded-[18px] transition-all duration-200 text-[var(--lp-dark)]',
                    active
                      ? 'bg-[var(--lp-card)] ring-2 ring-[var(--lp-dark)]'
                      : disabled
                        ? 'bg-[var(--lp-light)] opacity-50 cursor-not-allowed'
                        : 'bg-[var(--lp-light)] hover:-translate-y-0.5',
                  )}
                >
                  {active && (
                    <span className="absolute top-3 right-3 inline-flex size-[18px] items-center justify-center rounded-full bg-[var(--lp-accent)] text-[var(--lp-dark)]">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path
                          d="M3.5 8.5l3 3 6-7"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                  <div className="flex items-center gap-2.5">
                    <WalletAvatar address={o.address ?? '0x0'} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold tracking-[-0.01em] leading-tight">
                        {o.label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="mono text-[10px] truncate text-[var(--lp-text-sub)]">
                          {o.address ? shortAddress(o.address) : 'not configured'}
                        </span>
                        {o.address && <CopyAddress value={o.address} />}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 flex items-baseline justify-between gap-2 border-t border-black/[0.07]">
                    <span className="text-[11px] font-medium text-[var(--lp-text-sub)]">
                      Balance
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="font-sans text-[15px] font-bold tabular-nums tracking-[-0.01em] leading-none">
                        {o.address ? (balHuman ?? '—') : '—'}
                      </span>
                      <span className="mono text-[9px] uppercase tracking-[0.1em] leading-none text-[var(--lp-text-sub)]">
                        USDC
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[18px] bg-[var(--lp-light)] p-5 transition-colors focus-within:ring-2 focus-within:ring-[var(--lp-dark)]/15">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-[var(--lp-text-sub)]">Amount</span>
            <span className="mono text-[11px] text-[var(--lp-text-sub)]">
              Arc · {arcHuman ? `${formatUsdc(arcHuman, { withSuffix: false })} USDC available` : '—'}
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
              className="no-spinner flex-1 bg-transparent font-sans text-[34px] font-bold tracking-[-0.02em] tabular-nums focus:outline-none placeholder:text-[var(--lp-text-muted)] min-w-0"
              placeholder="0"
            />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lp-card)] px-3 py-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--lp-accent)]" />
              <span className="mono text-[12px] font-semibold">USDC</span>
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="group mt-auto w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-4 text-[14px] font-semibold transition-all duration-200 bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {!isConnected ? (
            'Connect wallet to fund'
          ) : hasActiveTransfer ? (
            'Transfer in progress…'
          ) : (
            <>
              <span>Send to {selectedAgent?.label.toLowerCase() ?? 'agent'}</span>
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
          <p className="text-[11px] text-[var(--lp-text-sub)] leading-snug">
            One transfer at a time. Native transfers settle in nonce order, so a second one would
            just queue behind this until it confirms.
          </p>
        )}
      </form>

      {records.length > 0 && (
        <div className="mt-7 pt-5 border-t border-black/[0.07]">
          <div className="flex items-baseline justify-between mb-3.5">
            <h3 className="font-sans text-[15px] font-bold tracking-[-0.01em]">Activity</h3>
            <p className="mono text-[11px] text-[var(--lp-text-sub)]">
              {records.length} {records.length === 1 ? 'transfer' : 'transfers'}
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

const TONE_COLOR = {
  positive: '#15803d',
  critical: '#b91c1c',
  live: 'var(--lp-accent)',
} as const;

function phaseLabel(phase: FundPhase): string {
  switch (phase) {
    case 'switching':
      return 'Switching to Arc';
    case 'signing':
      return 'Sign in wallet';
    case 'confirming':
      return 'Confirming on Arc';
    case 'done':
      return 'Sent';
    case 'error':
      return 'Failed';
  }
}

function phaseTone(phase: FundPhase): 'live' | 'positive' | 'critical' {
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
  record: FundRecord;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const tone = phaseTone(record.phase);
  const elapsedSec = Math.max(0, Math.floor((Date.now() - record.startedAt) / 1000));
  const isSlow = record.phase === 'confirming' && elapsedSec > 15;
  // A real Arc tx confirms in seconds. Past two minutes it is almost certainly
  // a dropped or dead tx, so offer the same escape hatch as a failed one.
  const isStuck = record.phase === 'confirming' && elapsedSec > 120;
  const canRetry = record.phase === 'error' || isStuck;
  const canDismiss = record.phase === 'done' || record.phase === 'error' || isStuck;
  const textColor =
    tone === 'positive' ? TONE_COLOR.positive : tone === 'critical' ? TONE_COLOR.critical : 'var(--lp-text-sub)';
  return (
    <li
      className={cn(
        'rounded-[16px] transition-all overflow-hidden',
        expanded ? 'bg-[var(--lp-light)]' : 'bg-[var(--lp-light)]/60 hover:bg-[var(--lp-light)]',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 flex items-center gap-3"
      >
        <WalletAvatar address={record.agentAddress} size={26} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-sans text-[17px] font-bold tabular-nums leading-none tracking-[-0.01em]">
              {formatUsdc(record.amountUsdc, { withSuffix: false })}
            </span>
            <span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--lp-text-sub)] leading-none">
              → {record.agentKey}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <PhaseDot tone={tone} pulse={tone === 'live'} />
            <span
              className="text-[11px] font-medium leading-none"
              style={{ color: textColor }}
            >
              {phaseLabel(record.phase)}
            </span>
            <span className="mono text-[10px] text-[var(--lp-text-sub)] leading-none">
              · {elapsed(record.startedAt)}
            </span>
            {isSlow && (
              <span
                className="text-[10px] uppercase tracking-[0.1em] leading-none px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(180,83,9,0.12)', color: '#b45309' }}
              >
                Slow
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
            className="inline-flex items-center gap-1 mono text-[10px] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] px-2 py-1 rounded-md bg-[var(--lp-card)] shrink-0 transition-colors"
            title="View on Arcscan"
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
            'text-[var(--lp-text-sub)] transition-transform shrink-0',
            expanded && 'rotate-180',
          )}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-black/[0.07] px-3 py-3 space-y-3">
          {record.error && <Note tone="error">{record.error}</Note>}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[11px] text-[var(--lp-text-sub)]">
              <span className="font-medium">Recipient</span>
              <span className="mono">{shortAddress(record.agentAddress)}</span>
            </div>
            {record.txHash && (
              <a
                href={ARC_EXPLORER_TX(record.txHash)}
                target="_blank"
                rel="noreferrer"
                className="flex items-baseline justify-between gap-3 text-[11px] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)]"
              >
                <span className="font-medium">Tx · Arc</span>
                <span className="mono inline-flex items-center gap-1">
                  {shortHash(record.txHash)}
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M5.5 4.5h6v6M11 5l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </span>
              </a>
            )}
          </div>

          {isStuck && (
            <p className="text-[11px] text-[var(--lp-text-sub)] leading-snug">
              This transfer has not confirmed in a while. It is likely a dropped tx. Retry to send a
              fresh one, or dismiss it.
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-1.5 rounded-full text-[12px] font-semibold bg-[var(--lp-accent)] text-[var(--lp-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
              >
                Retry
              </button>
            )}
            {canDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-4 py-1.5 rounded-full text-[12px] font-medium text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-card)] transition-colors"
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

function PhaseDot({ tone, pulse }: { tone: 'live' | 'positive' | 'critical'; pulse: boolean }) {
  const color = TONE_COLOR[tone];
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
          style={{ background: color }}
        />
      )}
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}
