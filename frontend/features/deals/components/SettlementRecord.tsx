'use client';

import { useState } from 'react';
import type { MoneyMovementState, MoneyMovementView } from '@/core/api';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import { Skeleton } from '@/shared/components/Skeleton';
import { PortableReceipt, type PortableReceiptItem } from '@/features/activity/components/PortableReceipt';
import { settlementExplorer } from '@/core/arcNetwork';

export type SettlementRecordFetchState = 'loading' | 'ready' | 'error' | 'unavailable';

interface LegacyReceipt {
  key: 'funding' | 'refund';
  txHash: string;
}

/// One dot colour per state; the label beside it carries the meaning.
const STATUS_DOT: Record<MoneyMovementState, string> = {
  created: 'var(--lp-workspace-muted)',
  preparing: 'var(--info)',
  submitted: 'var(--warn)',
  verifying: 'var(--info)',
  completed: 'var(--pos)',
  needs_attention: 'var(--warn)',
  cancelled: 'var(--lp-workspace-muted)',
};

function utcStamp(value: number, locale: string): string {
  const stamp = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(value));
  return `${stamp} UTC`;
}

const MICROS = 1_000_000n;

function toMicros(value: string | number): bigint | null {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole!) * MICROS + BigInt(fraction.padEnd(6, '0'));
}

function fromMicros(value: bigint): string {
  const fraction = (value % MICROS).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${value / MICROS}.${fraction}` : `${value / MICROS}`;
}

/// How a payment relates to the deal amount, in exact 6-decimal maths: the
/// buyer's funding is the deal plus the fee, a payout is the milestone's share
/// less the fee. Null when there is no fee to explain or the inputs are unknown.
export function paymentBreakdown(
  movement: Pick<MoneyMovementView, 'kind' | 'amountUsdc' | 'milestoneIndex'>,
  dealAmountUsdc: string | undefined,
  milestonePcts: number[],
): { base: string; fee: string } | null {
  const amount = toMicros(movement.amountUsdc);
  const deal = dealAmountUsdc ? toMicros(dealAmountUsdc) : null;
  if (amount === null || deal === null) return null;
  if (movement.kind === 'escrow_funding') {
    return amount > deal ? { base: fromMicros(deal), fee: fromMicros(amount - deal) } : null;
  }
  const pct = milestonePcts[movement.milestoneIndex ?? 0] ?? (milestonePcts.length === 1 ? 100 : undefined);
  if (pct === undefined) return null;
  const share = (deal * BigInt(pct)) / 100n;
  return share > amount ? { base: fromMicros(share), fee: fromMicros(share - amount) } : null;
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
  dealAmountUsdc,
  milestonePcts = [],
  bare = false,
}: {
  /// Inside the Receipts sheet, which already names the section.
  bare?: boolean;
  dealAmountUsdc?: string;
  milestonePcts?: number[];
  movements: MoneyMovementView[];
  fetchState: SettlementRecordFetchState;
  fundTxHash?: string;
  refundTxHash?: string;
  onRetry: () => void;
  canShareReceipts?: boolean;
}) {
  const translations = useTranslations();
  const { locale } = useLocale();
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
      aria-labelledby={bare ? undefined : 'settlement-record-heading'}
      data-float-guard
      aria-label={bare ? copy.title : undefined}
      className={bare ? '' : 'mt-7 border-t border-[var(--lp-workspace-border)] pt-7'}
    >
      {bare ? null : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h3 id="settlement-record-heading" className="font-display text-[23px] font-semibold tracking-[-0.035em] text-[var(--lp-workspace-ink)]">
            {copy.title}
          </h3>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-[var(--lp-workspace-muted)] sm:text-end">
            {copy.body}
          </p>
        </div>
      )}

      {fetchState === 'loading' && (
        <div className="mt-5 space-y-3" aria-label={copy.loadingLabel} aria-busy="true">
          <div className="rounded-[12px] border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-raised)] p-4">
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
          <p className="text-[14px] leading-relaxed text-[var(--lp-workspace-muted)]">{copy.errorBody}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-workspace-ink)] underline underline-offset-4 transition-colors hover:text-[var(--lp-accent)]"
          >
            {copy.retry}
          </button>
        </div>
      )}

      {fetchState !== 'loading' && fetchState !== 'error' && movements.length > 0 && (
        <div className="mt-5 space-y-3">
          {/* Oldest first: the buyer's funding, then each payout. */}
          {[...movements].sort((a, b) => a.createdAt - b.createdAt).map((movement, index) => {
            const breakdown = paymentBreakdown(movement, dealAmountUsdc, milestonePcts);
            const expanded = openReference === movement.reference;
            const stateLabel = copy.states[movement.state];
            const kindLabel =
              movement.kind === 'escrow_funding'
                ? copy.kinds.escrow_funding
                : copy.kinds.milestone_payout;
            // A finished payment has no next step to name.
            const nextAction = movement.state === 'completed' || movement.nextActor === 'none'
              ? null
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
            const provable = movement.legs.some((leg) => leg.explorerUrl && leg.txHash);
            const row = 'flex items-center justify-between gap-4 border-t border-[var(--lp-workspace-border)] py-3 text-[14px]';
            return (
              <article
                key={movement.reference}
                className="rounded-[20px] border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-raised)] px-5 pb-4 pt-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-medium text-[var(--lp-workspace-muted)]">
                    {movements.length > 1 ? `${copy.paymentTemplate.replace('{n}', String(index + 1))} · ` : ''}{kindLabel}
                  </p>
                  <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--lp-workspace-ink)]">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: STATUS_DOT[movement.state] }} />
                    {stateLabel}
                  </span>
                </div>
                <p className="mt-3 flex items-baseline gap-2 tabular-nums">
                  <span className="text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--lp-workspace-ink)]">{movement.amountUsdc}</span>
                  <span className="text-[16px] font-semibold text-[var(--lp-workspace-muted)]">USDC</span>
                </p>
                {breakdown ? (
                  <p className="mt-2 text-[14px] tabular-nums text-[var(--lp-workspace-muted)]">
                    {(movement.kind === 'escrow_funding' ? copy.fundingBreakdown : copy.payoutBreakdown)
                      .replace('{deal}', breakdown.base)
                      .replace('{share}', breakdown.base)
                      .replace('{fee}', breakdown.fee)}
                  </p>
                ) : null}

                <dl className="mt-4">
                  <div className={row}>
                    <dt className="text-[var(--lp-workspace-muted)]">{copy.dateLabel}</dt>
                    <dd className="text-end tabular-nums text-[var(--lp-workspace-ink)]">{utcStamp(movement.completedAt ?? movement.updatedAt, locale)}</dd>
                  </div>
                  <div className={row}>
                    <dt className="text-[var(--lp-workspace-muted)]">{copy.referenceLabel}</dt>
                    <dd className="min-w-0">
                      <button
                        type="button"
                        onClick={() => copyReference(movement.reference)}
                        aria-label={copy.copyReference.replace('{reference}', movement.reference)}
                        className="-me-2 inline-flex min-h-11 max-w-full items-center gap-2 rounded-[10px] px-2 mono text-[13px] tracking-[0.04em] text-[var(--lp-workspace-ink)] transition-colors hover:bg-[var(--lp-workspace-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                      >
                        <span className="truncate">{movement.reference}</span>
                        <Icon name={copiedReference === movement.reference ? 'check' : 'copy'} size={16} className="shrink-0 text-[var(--lp-workspace-muted)]" />
                      </button>
                    </dd>
                  </div>
                  {nextAction ? (
                    <div className={row}>
                      <dt className="text-[var(--lp-workspace-muted)]">{copy.nextLabel}</dt>
                      <dd className="text-end text-[var(--lp-workspace-ink)]">{nextAction}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSelectedReceipt(receiptItem)}
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--lp-workspace-ink)] px-5 text-[15px] font-semibold text-[var(--lp-workspace-raised)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
                  >
                    {receiptCopy.viewReceipt}
                  </button>
                  {provable ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`proof-${movement.reference}`}
                      onClick={() =>
                        setOpenReference((current) =>
                          current === movement.reference ? null : movement.reference,
                        )
                      }
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[var(--lp-workspace-border)] px-5 text-[15px] font-semibold text-[var(--lp-workspace-ink)] transition-colors hover:bg-[var(--lp-workspace-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                    >
                      {expanded ? copy.hideProof : copy.showProof}
                      <Icon name="chevron-right" size={16} directional className={`transition-transform duration-200 motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                  ) : null}
                </div>

                {expanded && (
                  <ol id={`proof-${movement.reference}`} className="mt-3">
                    {movement.legs.map((leg) => (
                      <li key={`${movement.reference}:${leg.key}`} className="flex items-center justify-between gap-3 border-t border-[var(--lp-workspace-border)] py-3">
                        <div className="min-w-0">
                          <p className="text-[14px] text-[var(--lp-workspace-ink)]">{leg.label}</p>
                          <p className="text-[14px] text-[var(--lp-workspace-muted)]">{copy.legStates[leg.state]}</p>
                          {leg.providerId && (
                            <p className="mt-0.5 break-all mono text-[13px] tabular-nums text-[var(--lp-workspace-faint)]">
                              {copy.providerReference}: {shortProof(leg.providerId)}
                            </p>
                          )}
                        </div>
                        {leg.explorerUrl && leg.txHash && (
                          <a
                            href={leg.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-[var(--lp-workspace-ink)] transition-colors hover:bg-[var(--lp-workspace-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                          >
                            {copy.openProof}
                            <Icon name="arrow-up-right" size={16} directional />
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      )}

      {fetchState !== 'loading' && legacyReceipts.length > 0 && (
        <div className="mt-5 border-t border-[var(--lp-workspace-border)] pt-4">
          <p className="text-[14px] font-semibold text-[var(--lp-workspace-faint)]">{copy.legacyTitle}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-workspace-muted)]">{copy.legacyBody}</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {legacyReceipts.map((receipt) => (
              <a
                key={`${receipt.key}:${receipt.txHash}`}
                href={`${settlementExplorer}/tx/${receipt.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[var(--lp-workspace-ink)] transition-colors hover:text-[var(--lp-accent)]"
              >
                {receipt.key === 'funding' ? copy.legacyFunding : copy.legacyRefund}
                <span className="mono text-[13px] font-normal tabular-nums text-[var(--lp-workspace-muted)]">{shortProof(receipt.txHash)}</span>
                <Icon name="arrow-up-right" size={16} directional />
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
