import { createHash } from 'node:crypto';

/// Fields read off an invoice or receipt. A model may fill these in; only the
/// checks below decide whether the invoice counts.
export interface ExtractedInvoice {
  issuer?: string;
  counterparty?: string;
  amount?: number;
  currency?: string;
  /// ISO date, as printed on the invoice.
  date?: string;
  number?: string;
}

export type InvoiceCheck =
  | { ok: true; fingerprint: string }
  | { ok: false; reason: 'missing_fields' | 'future_date' | 'too_old' | 'issuer_mismatch' };

const MAX_AGE_MS = 3 * 365 * 24 * 3_600_000;
const SUFFIXES = /\b(ltd|limited|plc|llc|inc|enterprises?|ventures)\b/g;

function norm(s: string | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/// The same invoice always has the same fingerprint, however it was typed or
/// photographed, so it can back one account and never a second.
export function invoiceFingerprint(x: ExtractedInvoice): string {
  const parts = [
    norm(x.issuer),
    norm(x.counterparty),
    (x.amount ?? 0).toFixed(2),
    (x.currency ?? '').trim().toUpperCase(),
    (x.date ?? '').trim(),
    norm(x.number),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function checkInvoice(x: ExtractedInvoice, account: { displayName: string }, now: number): InvoiceCheck {
  const when = x.date ? Date.parse(x.date) : Number.NaN;
  if (!norm(x.issuer) || !norm(x.counterparty) || !(Number(x.amount) > 0) || !Number.isFinite(when)) {
    return { ok: false, reason: 'missing_fields' };
  }
  if (when > now) return { ok: false, reason: 'future_date' };
  if (when < now - MAX_AGE_MS) return { ok: false, reason: 'too_old' };
  // Work done is an invoice the account issued, never one it received.
  if (norm(x.issuer) !== norm(account.displayName)) return { ok: false, reason: 'issuer_mismatch' };
  return { ok: true, fingerprint: invoiceFingerprint(x) };
}
