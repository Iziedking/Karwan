'use client';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { Card } from '@/shared/components/Card';
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
    <Card noPadding>
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="display text-[26px] text-[var(--color-ink)]">Fund agent on Arc</h2>
          <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">
            direct USDC transfer · single tx · settles in ~3s
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeCount > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{
                background: 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
                color: 'var(--color-accent)',
                border: '1px solid color-mix(in oklab, var(--color-accent) 35%, transparent)',
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent)] opacity-60 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              </span>
              {activeCount} in flight
            </span>
          )}
          <button
            type="button"
            onClick={refetchAll}
            disabled={refreshing}
            title="Refresh balances"
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <svg
              width="11"
              height="11"
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

      <div className="px-5 pb-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p className="eyebrow mb-2">Recipient</p>
            <div className="grid grid-cols-2 gap-2.5">
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
                    className={`relative text-left px-3 py-3 rounded-lg border transition-all overflow-hidden ${
                      active
                        ? 'border-[var(--color-ink)] bg-[var(--color-surface-2)]'
                        : disabled
                        ? 'border-[var(--color-line)] bg-[var(--color-surface)] opacity-50 cursor-not-allowed'
                        : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)] bg-[var(--color-surface)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <AgentAvatar address={o.address ?? '0x0'} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold tracking-tight leading-tight">
                          {o.label}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] mono text-[var(--color-ink-faint)] truncate">
                            {o.address ? shortAddress(o.address) : 'not configured'}
                          </span>
                          {o.address && <CopyAddress value={o.address} />}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-[var(--color-line)] flex items-baseline justify-between gap-2">
                      <span className="eyebrow">Balance</span>
                      <span className="inline-flex items-baseline gap-1">
                        <span
                          className="text-[15px] font-medium tabular-nums tracking-tight leading-none"
                          style={{ fontFamily: 'var(--font-serif)' }}
                        >
                          {o.address ? (balHuman ?? '—') : '—'}
                        </span>
                        <span className="text-[9px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)] leading-none">
                          USDC
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] focus-within:border-[var(--color-ink)] transition-colors">
            <div className="px-4 pt-3 pb-1 flex items-baseline justify-between">
              <span className="eyebrow">Amount</span>
              <span className="text-[10px] mono text-[var(--color-ink-faint)]">
                Arc · {arcHuman ? `${formatUsdc(arcHuman, { withSuffix: false })} USDC available` : '—'}
              </span>
            </div>
            <div className="px-4 pb-3 flex items-baseline gap-3">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="no-spinner flex-1 bg-transparent text-[32px] font-medium tracking-tight tabular-nums focus:outline-none placeholder:text-[var(--color-ink-faint)] min-w-0"
                style={{ fontFamily: 'var(--font-serif)' }}
                placeholder="0"
              />
              <span className="text-[14px] mono text-[var(--color-ink-dim)] font-semibold">USDC</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="group relative w-full px-4 py-3 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 overflow-hidden"
            style={{
              background: canSubmit
                ? 'linear-gradient(180deg, #1a1c1f 0%, #0c0e10 100%)'
                : '#0c0e10',
              color: '#ffffff',
              boxShadow: canSubmit
                ? '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 22px -10px rgba(12,14,16,0.45)'
                : 'none',
            }}
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
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
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
            <p className="text-[11px] text-[var(--color-ink-faint)] leading-snug">
              One transfer at a time. Native transfers settle in nonce order, so a second one
              would just queue behind this until it confirms.
            </p>
          )}
        </form>

        {records.length > 0 && (
          <div className="mt-7 pt-5 border-t border-[var(--color-line)]">
            <div className="flex items-baseline justify-between mb-3.5">
              <h3 className="display text-[16px]">Activity</h3>
              <p className="text-[10px] mono text-[var(--color-ink-faint)]">
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
      </div>
    </Card>
  );
}

function AgentAvatar({ address }: { address: string }) {
  return <WalletAvatar address={address} size={26} />;
}

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
  return (
    <li
      className={`rounded-lg border transition-all overflow-hidden ${
        expanded
          ? 'border-[var(--color-ink)] bg-[var(--color-surface-2)]'
          : 'border-[var(--color-line)] hover:border-[var(--color-line-strong)] bg-[var(--color-surface)]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 flex items-center gap-3"
      >
        <AgentAvatar address={record.agentAddress} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span
              className="text-[18px] font-medium tabular-nums leading-none tracking-tight"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {formatUsdc(record.amountUsdc, { withSuffix: false })}
            </span>
            <span className="text-[10px] mono uppercase tracking-[0.1em] text-[var(--color-ink-faint)] leading-none">
              → {record.agentKey}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <PhaseDot tone={tone} pulse={tone === 'live'} />
            <span
              className={`text-[11px] font-medium leading-none ${
                tone === 'positive'
                  ? 'text-[var(--color-positive)]'
                  : tone === 'critical'
                  ? 'text-[var(--color-critical)]'
                  : 'text-[var(--color-ink-dim)]'
              }`}
            >
              {phaseLabel(record.phase)}
            </span>
            <span className="text-[10px] mono text-[var(--color-ink-faint)] leading-none">
              · {elapsed(record.startedAt)}
            </span>
            {isSlow && (
              <span
                className="text-[10px] uppercase tracking-[0.1em] leading-none px-1.5 py-0.5 rounded"
                style={{
                  background: 'var(--color-warning-soft)',
                  color: 'var(--color-warning)',
                }}
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
            className="inline-flex items-center gap-1 text-[10px] mono text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] px-2 py-1 rounded-md border border-[var(--color-line)] hover:border-[var(--color-line-strong)] shrink-0"
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
          className={`text-[var(--color-ink-faint)] transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-line)] px-3 py-3 space-y-3">
          {record.error && (
            <div
              className="rounded-md px-2.5 py-2"
              style={{
                border: '1px solid color-mix(in oklab, var(--color-critical) 30%, transparent)',
                background: 'color-mix(in oklab, var(--color-critical) 8%, transparent)',
              }}
            >
              <p className="text-[12px] text-[var(--color-critical)] leading-snug">{record.error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[11px] text-[var(--color-ink-dim)]">
              <span className="eyebrow">Recipient</span>
              <span className="mono">{shortAddress(record.agentAddress)}</span>
            </div>
            {record.txHash && (
              <a
                href={ARC_EXPLORER_TX(record.txHash)}
                target="_blank"
                rel="noreferrer"
                className="flex items-baseline justify-between gap-3 text-[11px] hover:text-[var(--color-ink)] text-[var(--color-ink-dim)]"
              >
                <span className="eyebrow">Tx · Arc</span>
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
            <p className="text-[11px] text-[var(--color-ink-faint)] leading-snug">
              This transfer has not confirmed in a while. It is likely a dropped tx. Retry to send
              a fresh one, or dismiss it.
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
                className="px-3 py-1.5 rounded-md text-[12px] font-semibold hover:opacity-90 transition-opacity"
              >
                Retry
              </button>
            )}
            {canDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-1.5 rounded-md text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] transition-colors"
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
  const color =
    tone === 'positive'
      ? 'var(--color-positive)'
      : tone === 'critical'
      ? 'var(--color-critical)'
      : 'var(--color-accent)';
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
          style={{ background: color }}
        />
      )}
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}
