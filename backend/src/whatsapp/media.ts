import { createHash } from 'node:crypto';
import type { StoredFact } from '../verification/evidence.js';
import { checkInvoice, type ExtractedInvoice } from '../verification/invoice.js';
import type { OutMessage } from './render.js';
import type { InboundMessage } from './types.js';

const TWO_YEARS_MS = 2 * 365 * 24 * 3_600_000;
const READABLE = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

export interface IntakeDeps {
  now: () => number;
  /// The file Meta holds for this message, or null when it is missing or too
  /// large. Nothing is kept after it is read.
  download: (mediaId: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  /// Reads the fields off the document. Decides nothing.
  extract: (bytes: Uint8Array, mimeType: string) => Promise<ExtractedInvoice>;
  displayNameOf: (address: string) => Promise<string>;
  claimFingerprint: (fingerprint: string, address: string) => Promise<boolean>;
  addFact: (address: string, fact: StoredFact) => Promise<boolean>;
}

const text = (body: string): OutMessage => ({ kind: 'text', body });

/// A photo or PDF sent in chat, read as an invoice for work the person did.
/// The file itself is never stored: only its hash, the fields read from it and
/// its fingerprint, which stops the same invoice backing a second account.
export function createEvidenceIntake(deps: IntakeDeps) {
  return async function intake(address: string, m: InboundMessage): Promise<OutMessage[]> {
    if (!m.mediaId) return [text("I couldn't open that file. Please send it again.")];
    const file = await deps.download(m.mediaId);
    if (!file) return [text("I couldn't open that file. Please send it again, under 10 MB.")];
    if (!READABLE.test(file.mimeType)) return [text('Please send the invoice as a photo or a PDF.')];

    let fields: ExtractedInvoice;
    try {
      fields = await deps.extract(file.bytes, file.mimeType);
    } catch {
      return [text("I couldn't read that invoice just now. Please try again in a minute.")];
    }

    const check = checkInvoice(fields, { displayName: await deps.displayNameOf(address) }, deps.now());
    if (!check.ok) {
      const why: Record<typeof check.reason, string> = {
        missing_fields:
          "I couldn't read who it was for, the amount or the date. Please send a clearer photo of the whole invoice.",
        future_date: 'That invoice is dated in the future, so it cannot count yet.',
        too_old: 'That invoice is more than three years old. Please send a more recent one.',
        issuer_mismatch:
          'This invoice was not issued by you under your Karwan name. Send an invoice issued by you, or update your name to match.',
      };
      return [text(why[check.reason])];
    }
    if (!(await deps.claimFingerprint(check.fingerprint, address))) {
      return [text('That invoice is already on a Karwan record, so it cannot be added again.')];
    }

    const issuedAt = deps.now();
    await deps.addFact(address, {
      id: `inv-${check.fingerprint.slice(0, 16)}`,
      kind: 'invoice',
      level: 'user_proof',
      issuedAt,
      expiresAt: issuedAt + TWO_YEARS_MS,
      corroborated: false,
      evidenceHash: `0x${createHash('sha256').update(file.bytes).digest('hex')}`,
      source: 'whatsapp',
    });
    return [
      text(
        `Got it: an invoice to ${fields.counterparty} for ${fields.amount} ${fields.currency ?? ''}`.trim() +
          `, dated ${fields.date}.\n\nTo count it, ${fields.counterparty} confirms the job. Send me their WhatsApp number and I'll ask them.`,
      ),
    ];
  };
}
