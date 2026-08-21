'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Messages } from '@/shared/i18n/messages/en';
import {
  downloadReceiptImage,
  readableMovementText,
  shortenHash,
  type ReceiptExportData,
} from '../receiptPresentation';

type Copy = Messages['activity']['myMoney'];

export interface PortableReceiptItem {
  ts: number;
  summary: string;
  amountUsdc: string | null;
  refId: string | null;
  txHash: string | null;
  chain: string | null;
  status: 'done' | 'pending' | 'failed';
}

export function PortableReceipt({
  item,
  copy,
  closeLabel,
  proofHref,
  onClose,
}: {
  item: PortableReceiptItem;
  copy: Copy;
  closeLabel: string;
  proofHref: string | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const reference = item.refId?.trim() || null;
  const status = item.status === 'done' ? 'COMPLETED' : item.status === 'pending' ? copy.pending : copy.failed;
  const date = new Date(item.ts).toLocaleString();
  /// A movement recorded before Karwan minted references has no reference and
  /// never will: one is created with the movement, so there is nothing to
  /// recover and nothing honest to invent. It does have the transaction it
  /// settled in, which is the identifier a reader can actually verify, so that
  /// takes the slot instead of a three-line apology sitting where an identifier
  /// belongs.
  const transaction = item.txHash
    ? { label: copy.receiptTransaction, value: shortenHash(item.txHash) }
    : undefined;
  const data = useMemo<ReceiptExportData>(
    () => ({
      title: copy.receiptTitle,
      summary: readableMovementText(item.summary),
      reference,
      amount: item.amountUsdc ? `${item.amountUsdc} USDC` : null,
      status,
      date,
      transaction,
      referenceLabel: copy.receiptReference,
      referenceNone: copy.receiptReferenceNone,
      historicalNote: copy.receiptHistorical,
      sharedNote: copy.receiptSharedNote,
    }),
    [copy, date, item.amountUsdc, item.summary, proofHref, reference, status, transaction],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="karwan-receipt-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="karwan-receipt-title"
        className="w-full max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-[var(--lp-card)] p-5 shadow-2xl outline-none sm:max-w-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">[:RECEIPT:]</p>
            <h2 id="karwan-receipt-title" className="mt-2 text-[22px] font-bold tracking-[-0.03em] text-[var(--lp-dark)]">
              {copy.receiptTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--lp-border-light)] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            ×
          </button>
        </div>

        <article className="karwan-receipt-print relative mt-5 overflow-hidden rounded-xl border border-[var(--lp-border-light)] bg-[var(--lp-light)] p-5">
          <span aria-hidden className="pointer-events-none absolute -bottom-5 -right-5 select-none text-[72px] font-black tracking-[-0.08em] text-[var(--lp-border-light)] opacity-70">
            KARWAN.
          </span>
          <div className="flex items-center gap-3 border-b border-[var(--lp-border-light)] pb-4">
            <img src="/brand/karwan-mark-lime.svg" alt="" aria-hidden className="h-11 w-11 rounded-xl" />
            <div>
              <p className="font-bold tracking-[0.08em] text-[var(--lp-dark)]">KARWAN<span className="text-[var(--lp-accent)]">.</span></p>
              <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">USDC settlement</p>
            </div>
          </div>

          <p className="mt-5 break-words text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{readableMovementText(item.summary)}</p>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {reference || !transaction ? (
              <ReceiptField
                label={copy.receiptReference}
                value={reference ?? copy.receiptReferenceNone}
                mono={Boolean(reference)}
              />
            ) : (
              /* No reference was ever minted for this movement, so the
                 transaction it settled in is the identifier. The proof link
                 below opens the same hash on the explorer. */
              <ReceiptField label={transaction.label} value={transaction.value} mono />
            )}
            <ReceiptField label={copy.receiptAmount} value={item.amountUsdc ? `${item.amountUsdc} USDC` : '—'} mono />
            <ReceiptField label={copy.receiptStatus} value={status} />
            <ReceiptField label={copy.receiptDate} value={date} />
          </dl>

          {/* Why there is no Karwan reference, as a footnote rather than as the
              value of the field that should hold one. */}
          {!reference && (
            <p className="mt-4 text-[12px] leading-relaxed text-[var(--lp-text-muted)]">
              {copy.receiptHistorical}
            </p>
          )}

          {proofHref && (
            <a
              href={proofHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex min-h-11 items-center rounded-md border border-[var(--lp-border-light)] px-3 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-dark)] hover:bg-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              {copy.receiptProof} →
            </a>
          )}

          <p className="mt-5 border-t border-[var(--lp-border-light)] pt-4 text-[12px] leading-relaxed text-[var(--lp-text-sub)]">
            {copy.receiptSharedNote}
          </p>
        </article>

        <div className="karwan-receipt-actions mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--lp-accent)] px-4 mono text-[10px] uppercase tracking-[0.13em] font-bold text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {copy.receiptExportPdf}
          </button>
          <button
            type="button"
            onClick={() => downloadReceiptImage(data, `${reference ?? 'karwan-receipt'}.png`)}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--lp-border-light)] px-4 mono text-[10px] uppercase tracking-[0.13em] font-bold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {copy.receiptExportImage}
          </button>
        </div>

        <style jsx global>{`
          @media print {
            body * { visibility: hidden !important; }
            .karwan-receipt-overlay { position: static !important; display: block !important; background: transparent !important; padding: 0 !important; }
            .karwan-receipt-print, .karwan-receipt-print * { visibility: visible !important; }
            .karwan-receipt-print { position: absolute !important; inset: 0 !important; width: 100% !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; }
            .karwan-receipt-actions { display: none !important; }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

function ReceiptField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">{label}</dt>
      <dd className={`mt-1 break-words text-[13px] font-semibold text-[var(--lp-dark)] ${mono ? 'mono tabular-nums' : ''}`}>{value}</dd>
    </div>
  );
}
