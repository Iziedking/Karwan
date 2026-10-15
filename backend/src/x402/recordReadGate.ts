/// Every check that decides a record read runs before payment, so nobody pays
/// for a refusal. Pure: the route gathers the facts, this decides.

export type GateResult = { ok: true } | { ok: false; status: 403 | 404; error: string };

export type ReadPurpose = 'shortlist' | 'bid' | 'question';

export function recordReadGate(input: {
  subjectExists: boolean;
  subjectConsents: boolean;
  readerAccount: string | null;
  payerIsReadersAgent: boolean;
  readerIsPartyToRef: boolean;
}): GateResult {
  if (!input.subjectExists) return { ok: false, status: 404, error: 'No Karwan record for that subject.' };
  if (!input.subjectConsents) return { ok: false, status: 403, error: 'This person has not allowed agents to read their record.' };
  if (!input.readerAccount || !input.payerIsReadersAgent) {
    return { ok: false, status: 403, error: 'The paying agent does not act for the named account.' };
  }
  if (!input.readerIsPartyToRef) return { ok: false, status: 403, error: 'The reader is not part of that request.' };
  return { ok: true };
}

/// Who may read whom for a given purpose:
/// - shortlist: the person who posted the request reads a seller who bid on it;
/// - bid: a seller reads the person who posted an open request;
/// - question: anyone but the seller reads the seller behind a listing.
export function isPartyToRequest(
  input: { purpose: ReadPurpose; reader: string; subject: string },
  facts: { briefPoster: string | null; subjectBid: boolean; listingSeller: string | null },
): boolean {
  const reader = input.reader.toLowerCase();
  const subject = input.subject.toLowerCase();
  if (reader === subject) return false;
  const poster = facts.briefPoster?.toLowerCase() ?? null;
  switch (input.purpose) {
    case 'shortlist':
      return poster === reader && facts.subjectBid;
    case 'bid':
      return poster === subject;
    case 'question':
      return facts.listingSeller?.toLowerCase() === subject;
  }
}

/// The wallet that signed an x402 payment, from its authorization. Null when
/// there is no header or it cannot be read.
export function signedPayer(header: string | undefined): string | null {
  if (!header) return null;
  try {
    const signed = JSON.parse(Buffer.from(header, 'base64').toString('utf-8')) as {
      payload?: { authorization?: { from?: unknown } };
    };
    const from = signed.payload?.authorization?.from;
    return typeof from === 'string' ? from.toLowerCase() : null;
  } catch {
    return null;
  }
}

/// A paid retry must be signed by the named account's own x402 wallet, so
/// nobody can read as someone else by naming them. The first, unsigned request
/// only gets the price.
export function paymentFromReader(header: string | undefined, readerX402: string | undefined): boolean {
  if (!header) return true;
  return !!readerX402 && signedPayer(header) === readerX402.toLowerCase();
}
