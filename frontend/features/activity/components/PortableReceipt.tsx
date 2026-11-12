'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Messages } from '@/shared/i18n/messages/en';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { ReceiptCard } from '@/features/receipt/ReceiptCard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { buttonClasses } from '@/shared/components/Button';
import {
  downloadReceiptImage,
  readableMovementText,
  shortenHash,
  type ReceiptExportData,
} from '../receiptPresentation';
import { ledgerLine } from '../ledgerPresentation';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

type Copy = Messages['activity']['myMoney'];

export interface PortableReceiptItem {
  ts: number;
  summary: string;
  params?: Record<string, string> | null;
  amountUsdc: string | null;
  refId: string | null;
  txHash: string | null;
  chain: string | null;
  status: 'done' | 'pending' | 'failed';
  /// A send's note, read the same by sender and receiver (view 50).
  note?: string;
  /// What the sender typed in their own currency (view 55).
  local?: { currency: string; amount: string };
}

export function PortableReceipt({
  item,
  copy,
  closeLabel,
  proofHref,
  onClose,
  /// Whether this viewer may take the receipt away with them. Reading and
  /// sharing are different rights: on a deal the payer issues the proof of
  /// payment, so the seller can open the record and verify it but the exports
  /// belong to the buyer. Defaults to true, which is right for a viewer looking
  /// at their own money.
  canShare = true,
}: {
  item: PortableReceiptItem;
  copy: Copy;
  closeLabel: string;
  proofHref: string | null;
  onClose: () => void;
  canShare?: boolean;
}) {
  const money = useMoneyText({ compact: true });
  const panelRef = useRef<HTMLDivElement>(null);
  const noteLabel = useTranslations().money.sendFlow.note;
  const getHelp = useTranslations().supportPage.getHelp;
  const [mounted, setMounted] = useState(false);
  /// Which export is in flight. The work happens a frame after the press, so
  /// without this the button would look inert for that frame.
  const [busy, setBusy] = useState<'pdf' | 'image' | null>(null);
  const reference = item.refId?.trim() || null;
  const status = item.status === 'done' ? copy.receiptDone : item.status === 'pending' ? copy.pending : copy.failed;
  const network = item.chain ? capitalise(readableMovementText(item.chain)) : null;
  const date = new Date(item.ts).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  /// A movement recorded before Karwan minted references has no reference and
  /// never will: one is created with the movement, so there is nothing to
  /// recover and nothing honest to invent. It does have the transaction it
  /// settled in, which is the identifier a reader can actually verify, so that
  /// takes the slot instead of a three-line apology sitting where an identifier
  /// belongs.
  const transaction = item.txHash
    ? { label: copy.receiptTransaction, value: shortenHash(item.txHash) }
    : undefined;
  // The same sentence the ledger row shows, so a recipient reads "Received",
  // not the sender's "Sent" written at record time.
  const line = money.line(ledgerLine(item, copy.text));
  const data = useMemo<ReceiptExportData>(
    () => ({
      title: copy.receiptTitle,
      summary: item.note ? `${line} · ${noteLabel}: ${item.note}` : line,
      reference,
      amount: item.amountUsdc ? (item.status === 'done' ? money.paid : money.price)(item.amountUsdc, item.local) : null,
      status,
      date,
      transaction,
      referenceLabel: copy.receiptReference,
      referenceNone: copy.receiptReferenceNone,
      historicalNote: copy.receiptHistorical,
      sharedNote: copy.receiptSharedNote,
      done: item.status === 'done',
      dateLabel: copy.receiptDate,
      network: network ?? undefined,
      networkLabel: copy.receiptNetwork,
      verifyTitle: proofHref ? copy.receiptVerifyTitle : undefined,
      verifyUrl: proofHref ?? undefined,
      footnote: ARC_NETWORK === 'testnet' ? copy.receiptTestnet : undefined,
    }),
    [copy, date, item.amountUsdc, item.note, item.status, line, network, noteLabel, proofHref, reference, status, transaction],
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
      className="karwan-receipt-overlay fixed inset-0 z-[80] flex items-end bg-black/55 sm:items-stretch sm:justify-end"
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
        className="karwan-sheet-enter max-h-[92dvh] w-full overflow-y-auto rounded-t-[22px] bg-[var(--lp-card)] p-5 shadow-[var(--shadow-pop)] outline-none sm:h-full sm:max-h-none sm:w-[min(560px,100vw)] sm:rounded-none sm:rounded-s-[16px]"
      >
        <div className="karwan-receipt-chrome flex items-start justify-between gap-4">
          <div>
            <h2 id="karwan-receipt-title" className="text-[22px] font-semibold text-[var(--ink)]">
              {copy.receiptTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--lp-border-light)] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          >
            ×
          </button>
        </div>

        <ReceiptCard
          className="mt-5"
          status={{ label: status, tone: item.status }}
          kind={copy.receiptTitle}
          amount={item.amountUsdc ? (item.status === 'done' ? money.paid : money.price)(item.amountUsdc, item.local) : null}
          sentence={line}
          rows={[
            ...(item.note ? [{ label: noteLabel, value: item.note }] : []),
            { label: copy.receiptDate, value: date },
            ...(network ? [{ label: copy.receiptNetwork, value: network }] : []),
            { label: copy.receiptReference, value: reference ?? copy.receiptReferenceNone, mono: Boolean(reference) },
            ...(transaction ? [{ label: transaction.label, value: transaction.value, mono: true }] : []),
          ]}
          verify={proofHref ? { href: proofHref, title: copy.receiptVerifyTitle, body: copy.receiptVerifyBody, qrLabel: copy.receiptProof } : undefined}
          footnote={[reference ? null : copy.receiptHistorical, ARC_NETWORK === 'testnet' ? copy.receiptTestnet : null].filter(Boolean).join(' · ') || undefined}
        />

        {/* What moved on chain, for the record (view 55): behind Proof, never on the receipt itself. */}
        {item.amountUsdc ? (
          <details data-receipt-proof className="karwan-receipt-actions mt-3 text-[14px] text-[var(--ink-secondary)]">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold text-[var(--ink)]">{copy.receiptProof}</summary>
            <p className="flex justify-between gap-3 py-1 tabular-nums">
              <span>{copy.receiptSettled}</span>
              <span dir="ltr" className="font-medium text-[var(--ink)]">{money.usdc(item.amountUsdc, { compact: false, exact: true })}</span>
            </p>
          </details>
        ) : null}

        {!canShare && (
          <p className="karwan-receipt-actions mt-4 text-[14px] leading-relaxed text-[var(--lp-text-muted)]">
            {copy.receiptShareBuyerOnly}
          </p>
        )}
        {canShare && (
        <div className="karwan-receipt-actions mt-4 flex flex-col gap-2 sm:flex-row">
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
            className={buttonClasses({ size: 'lg', className: 'w-full sm:w-auto' })}
          >
            {copy.receiptExportImage}
          </button>
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
            className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full sm:w-auto' })}
          >
            {copy.receiptExportPdf}
          </button>
        </div>
        )}

        {/* A transfer that failed or has not arrived opens Help and support about it (view 78). */}
        {reference && item.status !== 'done' ? (
          <Link
            href={`/profile/help?transfer=${encodeURIComponent(reference)}`}
            data-get-help
            className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'mt-3 w-full print:hidden sm:w-auto' })}
          >
            {getHelp}
          </Link>
        ) : null}

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
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
