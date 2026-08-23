'use client';

import { useState } from 'react';
import type { MoneyMovementState, MoneyMovementView } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Skeleton } from '@/shared/components/Skeleton';
import { PortableReceipt, type PortableReceiptItem } from '@/features/activity/components/PortableReceipt';

export type SettlementRecordFetchState = 'loading' | 'ready' | 'error' | 'unavailable';

interface LegacyReceipt {
  key: 'funding' | 'refund';
  txHash: string;
}

const STATUS_TONE: Record<MoneyMovementState, { dot: string; className: string }> = {
  created: { dot: 'var(--ink-2)', className: 'border-white/10 bg-white/[0.03] text-white/60' },
  preparing: { dot: 'var(--info)', className: 'border-[color:var(--info)]/20 bg-[color:var(--info)]/10 text-white/75' },
  submitted: { dot: 'var(--warn)', className: 'border-[color:var(--warn)]/20 bg-[color:var(--warn)]/10 text-white/80' },
  verifying: { dot: 'var(--info)', className: 'border-[color:var(--info)]/20 bg-[color:var(--info)]/10 text-white/80' },
  completed: { dot: 'var(--pos)', className: 'border-[color:var(--pos)]/20 bg-[color:var(--pos)]/10 text-white/85' },
  needs_attention: { dot: 'var(--warn)', className: 'border-[color:var(--warn)]/25 bg-[color:var(--warn)]/10 text-white/85' },
  cancelled: { dot: 'var(--ink-2)', className: 'border-white/10 bg-white/[0.03] text-white/60' },
};

function utcStamp(value: number): string {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
  const day = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date).toUpperCase();
  return `${time} UTC · ${day}`;
}

function shortProof(value: string): string {
  return value.length > 24 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

export function SettlementRecord({
  movements,
  fetchState,
  fundTxHash,
  refundTxHash,
  onRetry,
  /// The buyer paid, so the buyer issues the proof. The seller reads the same
  /// record and verifies the same hashes, without the exports.
  canShareReceipts = true,
}: {
  movements: MoneyMovementView[];
  fetchState: SettlementRecordFetchState;
  fundTxHash?: string;
  refundTxHash?: string;
  onRetry: () => void;
  canShareReceipts?: boolean;
}) {
  const translations = useTranslations();
  const copy = translations.directDealDetail.settlementRecord;
  const receiptCopy = translations.activity.myMoney;
  const [openReference, setOpenReference] = useState<string | null>(null);
  const [copiedReference, setCopiedReference] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PortableReceiptItem | null>(null);
  const hasFundingMovement = movements.some((movement) => movement.kind === 'escrow_funding');
  const legacyReceipts: LegacyReceipt[] = [
    ...(fundTxHash && !hasFundingMovement
      ? [{ key: 'funding' as const, txHash: fundTxHash }]
      : []),
    ...(refundTxHash ? [{ key: 'refund' as const, txHash: refundTxHash }] : []),
  ];

  if (
    fetchState !== 'loading' &&
    fetchState !== 'error' &&
    movements.length === 0 &&
    legacyReceipts.length === 0
  ) {
    return null;
  }

  async function copyReference(reference: string) {
    try {
      await navigator.clipboard.writeText(reference);
      setCopiedReference(reference);
      window.setTimeout(() => setCopiedReference(null), 1500);
    } catch {
      // The reference stays visible and selectable if clipboard permission is unavailable.
    }
  }

  return (
    <section
      aria-labelledby="settlement-record-heading"
      data-float-guard
      className="mt-8 border-t border-white/[0.08] pt-8"
    >
      <p className="mono text-[10px] uppercase tracking-[0.18em] text-white/45">
        <span aria-hidden className="me-2 inline-block size-1 bg-white/35" />
        [:SETTLEMENT RECORD]
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h3 id="settlement-record-heading" className="font-display text-[22px] font-bold tracking-[-0.02em] text-white">
          {copy.title}
        </h3>
        <p className="max-w-[44ch] text-[12px] leading-relaxed text-white/50 sm:text-end">
          {copy.body}
        </p>
      </div>

      {fetchState === 'loading' && (
        <div className="mt-5 space-y-3" aria-label={copy.loadingLabel} aria-busy="true">
          <div className="rounded-[12px] border border-white/[0.08] p-4">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="mt-5 h-8 w-40" />
            <Skeleton className="mt-3 h-3 w-56 max-w-full" />
          </div>
        </div>
      )}

      {fetchState === 'error' && (
        <div className="mt-5 border-s border-[var(--warn)] ps-4 py-1">
          <p className="text-[13px] leading-relaxed text-white/70">{copy.errorBody}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex min-h-11 items-center mono text-[11px] uppercase tracking-[0.15em] text-white/75 transition-colors hover:text-[var(--lp-accent)]"
          >
            {copy.retry}
          </button>
        </div>
      )}

      {fetchState !== 'loading' && fetchState !== 'error' && movements.length > 0 && (
        <div className="mt-5 space-y-3">
          {movements.map((movement, index) => {
            const expanded = openReference === movement.reference;
            const tone = STATUS_TONE[movement.state];
            const stateLabel = copy.states[movement.state];
            const kindLabel =
              movement.kind === 'escrow_funding'
                ? copy.kinds.escrow_funding
                : copy.kinds.milestone_payout;
            const nextAction = movement.nextActor === 'none'
              ? copy.next.none
              : copy.next[movement.nextActor];
            const receiptItem: PortableReceiptItem = {
              ts: movement.completedAt ?? movement.updatedAt,
              summary: movement.summary,
              amountUsdc: movement.amountUsdc,
              refId: movement.reference,
              txHash: movement.legs.find((leg) => leg.txHash)?.txHash ?? null,
              chain: 'arc',
              status: movement.state === 'completed'
                ? 'done'
                : movement.state === 'needs_attention' || movement.state === 'cancelled'
                  ? 'failed'
                  : 'pending',
            };
            const proofHref = movement.legs.find((leg) => leg.explorerUrl && leg.txHash)?.explorerUrl ?? null;
            return (
              <article key={movement.reference} className="rounded-[12px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="mono text-[10px] uppercase tracking-[0.17em] text-white/40">
                      [:{String(index + 1).padStart(2, '0')}] {kindLabel}
                    </p>
                    <p className="mt-3 font-display text-[26px] font-bold leading-none tabular-nums text-white">
                      {movement.amountUsdc} <span className="mono text-[11px] tracking-[0.14em] text-white/50">USDC</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => copyReference(movement.reference)}
                      aria-label={copy.copyReference.replace('{reference}', movement.reference)}
                      className="mt-2 inline-flex min-h-11 max-w-full items-center gap-2 mono text-[11px] uppercase tracking-[0.13em] text-white/55 transition-colors hover:text-white"
                    >
                      <span className="break-all text-start">{movement.reference}</span>
                      <span aria-hidden>{copiedReference === movement.reference ? '✓' : '⧉'}</span>
                    </button>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <span className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-3 mono text-[10px] uppercase tracking-[0.12em] ${tone.className}`}>
                      <span aria-hidden className="size-1.5 rounded-full" style={{ background: tone.dot }} />
                      {stateLabel}
                    </span>
                    <span className="mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                      {utcStamp(movement.completedAt ?? movement.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="text-[13px] leading-relaxed text-white/70">{stateLabel}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-white/45">
                      {copy.nextLabel}: {nextAction}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedReceipt(receiptItem)}
                      className="inline-flex min-h-11 items-center rounded-[10px] border border-[var(--lp-accent)]/45 px-4 mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-accent)] transition-colors hover:border-[var(--lp-accent)] hover:bg-[var(--lp-accent)]/10"
                    >
                      {receiptCopy.viewReceipt}
                    </button>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`proof-${movement.reference}`}
                      onClick={() => setOpenReference(expanded ? null : movement.reference)}
                      className="inline-flex min-h-11 items-center justify-between gap-5 rounded-[10px] border border-white/15 px-4 mono text-[11px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-white/30 hover:text-white"
                    >
                      {expanded ? copy.hideProof : copy.showProof}
                      <span aria-hidden className={`transition-transform duration-200 motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}>›</span>
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div id={`proof-${movement.reference}`} className="mt-4 border-t border-white/[0.07] pt-4">
                    <p className="mono text-[10px] uppercase tracking-[0.16em] text-white/40">[:PROOF]</p>
                    <ol className="mt-3 space-y-3">
                      {movement.legs.map((leg, legIndex) => (
                        <li key={`${movement.reference}:${leg.key}`} className="grid gap-2 border-s border-white/10 ps-3 sm:grid-cols-[1fr_auto] sm:items-start">
                          <div className="min-w-0">
                            <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                              [:{String(legIndex + 1).padStart(2, '0')}] {copy.legStates[leg.state]}
                            </p>
                            <p className="mt-1 text-[13px] text-white/70">{leg.label}</p>
                            {leg.providerId && (
                              <p className="mt-1 break-all mono text-[10px] tabular-nums text-white/35">
                                {copy.providerReference}: {shortProof(leg.providerId)}
                              </p>
                            )}
                          </div>
                          {leg.explorerUrl && leg.txHash && (
                            <a
                              href={leg.explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-11 items-center mono text-[10px] uppercase tracking-[0.14em] text-white/55 transition-colors hover:text-[var(--lp-accent)]"
                            >
                              {copy.openProof} ↗
                            </a>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {fetchState !== 'loading' && legacyReceipts.length > 0 && (
        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-white/40">[:{copy.legacyTitle}]</p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/50">{copy.legacyBody}</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {legacyReceipts.map((receipt) => (
              <a
                key={`${receipt.key}:${receipt.txHash}`}
                href={`https://testnet.arcscan.app/tx/${receipt.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 mono text-[10px] uppercase tracking-[0.14em] text-white/55 transition-colors hover:text-[var(--lp-accent)]"
              >
                {receipt.key === 'funding' ? copy.legacyFunding : copy.legacyRefund}
                <span className="tabular-nums">{shortProof(receipt.txHash)}</span>
                <span aria-hidden>↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {selectedReceipt && (
        <PortableReceipt
          canShare={canShareReceipts}
          item={selectedReceipt}
          copy={receiptCopy}
          closeLabel={translations.common.close}
          proofHref={movements
            .flatMap((movement) => movement.legs)
            .find((leg) => leg.txHash === selectedReceipt.txHash)?.explorerUrl ?? null}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </section>
  );
}
