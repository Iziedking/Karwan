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
  /// Which export is in flight. The work happens a frame after the press, so
  /// without this the button would look inert for that frame.
  const [busy, setBusy] = useState<'pdf' | 'image' | null>(null);
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
        <div className="karwan-receipt-chrome flex items-start justify-between gap-4">
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
          {/* Watermark. Fully inside the box: it used to hang off the corner at
              -bottom-5 -right-5 under `overflow-hidden`, so the word was sliced
              in half on screen and again in the PDF, which read as a rendering
              fault rather than as a watermark. */}
          <span
            aria-hidden
            className="karwan-receipt-watermark pointer-events-none absolute bottom-3 right-4 select-none text-[clamp(34px,9vw,58px)] font-black leading-none tracking-[-0.06em] text-[var(--lp-border-light)] opacity-80"
          >
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
              /* The printed sheet keeps the anchor, for PDF writers that carry
                 link annotations, and prints the URL underneath for the ones
                 that do not. Either way the receipt stays verifiable. */
              data-proof-url={proofHref}
              className="karwan-receipt-proof mt-5 inline-flex min-h-11 items-center rounded-md border border-[var(--lp-border-light)] px-3 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-dark)] hover:bg-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
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
            onClick={() => {
              // Out of the click handler on purpose. `window.print()` blocks
              // until the dialog closes, and every second of that counted
              // against the interaction that opened it: the measured INP on
              // /activity was 133 seconds for this one button. Yielding a frame
              // lets the press paint and the interaction end before the browser
              // takes the thread.
              setBusy('pdf');
              requestAnimationFrame(() => {
                window.setTimeout(() => {
                  window.print();
                  setBusy(null);
                }, 0);
              });
            }}
            disabled={busy !== null}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--lp-accent)] px-4 mono text-[10px] uppercase tracking-[0.13em] font-bold text-[var(--lp-band-dark)] transition-opacity hover:bg-[var(--lp-accent-hover)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {copy.receiptExportPdf}
          </button>
          <button
            type="button"
            onClick={() => {
              // Same reason: building the SVG and rasterising it is work, and
              // it does not belong inside the interaction.
              setBusy('image');
              requestAnimationFrame(() => {
                window.setTimeout(() => {
                  downloadReceiptImage(data, `${reference ?? 'karwan-receipt'}.png`);
                  setBusy(null);
                }, 0);
              });
            }}
            disabled={busy !== null}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--lp-border-light)] px-4 mono text-[10px] uppercase tracking-[0.13em] font-bold text-[var(--lp-dark)] transition-opacity hover:bg-[var(--lp-light)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            {copy.receiptExportImage}
          </button>
        </div>

        {/* Print. The receipt is ONE page.

            The rule this replaces hid the rest of the app with
            `visibility: hidden`, which hides ink but keeps layout: the whole
            /activity page still occupied its full height, so the sheet count
            was whatever that page measured (four, in practice) and the receipt,
            stretched to `inset: 0` of it, dragged its watermark off the bottom
            of page one. `display: none` on everything else collapses the
            document to the receipt itself. */}
        <style jsx global>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 14mm;
            }
            html,
            body {
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              background: #ffffff !important;
            }
            /* Everything that is not the receipt leaves the document entirely,
               layout included. The overlay is portalled to <body>, so its
               siblings are the app root and the other portals. */
            body > *:not(.karwan-receipt-overlay) {
              display: none !important;
            }
            .karwan-receipt-overlay {
              position: static !important;
              display: block !important;
              inset: auto !important;
              z-index: auto !important;
              background: none !important;
              padding: 0 !important;
            }
            .karwan-receipt-overlay > * {
              max-width: none !important;
              max-height: none !important;
              width: 100% !important;
              overflow: visible !important;
              padding: 0 !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              background: #ffffff !important;
            }
            .karwan-receipt-print {
              position: relative !important;
              margin: 0 !important;
              border: 1px solid #d9ddd1 !important;
              box-shadow: none !important;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            /* The dialog's own furniture: the title row with its close button,
               and the export buttons. Neither means anything on paper. */
            .karwan-receipt-chrome,
            .karwan-receipt-actions {
              display: none !important;
            }
            /* A watermark has to sit inside the sheet. Anchored to the receipt
               box rather than to a stretched overlay, at a size that cannot
               reach the page edge. */
            .karwan-receipt-watermark {
              position: absolute !important;
              right: 10mm !important;
              bottom: 8mm !important;
              font-size: 44px !important;
              opacity: 0.5 !important;
              color: #e7eade !important;
            }
            /* Paper cannot be clicked, so the URL is printed under the link.
               PDF writers that preserve link annotations still carry the
               anchor itself. */
            .karwan-receipt-proof::after {
              content: ' ' attr(data-proof-url);
              display: block;
              margin-top: 4px;
              font-size: 8px;
              letter-spacing: 0;
              text-transform: none;
              word-break: break-all;
              color: #4e554c;
            }
            .karwan-receipt-proof {
              display: block !important;
              min-height: 0 !important;
              border: 0 !important;
              padding: 0 !important;
            }
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
