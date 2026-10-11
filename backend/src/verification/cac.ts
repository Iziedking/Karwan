import { evidenceHashOf, type StoredFact } from './evidence.js';

const YEAR_MS = 365 * 24 * 3_600_000;

/// A business registration number waiting for a reviewer. The CAC public
/// search is checked by a person until an automated lookup is verified, and
/// the fact says so (`human_reviewed`).
export interface CacRequest {
  id: string;
  address: string;
  rc: string;
  claimedName: string;
  status: 'review' | 'approved' | 'rejected' | 'revoked';
  createdAt: number;
  decidedAt?: number;
  reviewer?: string;
  /// Set when a reviewer undoes an approval.
  revokedAt?: number;
  revokedBy?: string;
  revokeReason?: string;
}

export interface CacDeps {
  now: () => number;
  newId: () => string;
  get: (id: string) => Promise<CacRequest | null>;
  put: (r: CacRequest) => Promise<void>;
  list: () => Promise<CacRequest[]>;
  addFact: (address: string, fact: StoredFact) => Promise<boolean>;
  /// Message the person in chat.
  tell: (address: string, text: string) => Promise<void>;
  /// The account a registration number already backs, if any.
  holderOf: (rc: string) => Promise<string | null>;
  /// Ties a number to one account. False when another account holds it.
  claim: (rc: string, address: string) => Promise<boolean>;
  release: (rc: string, address: string) => Promise<void>;
  revokeFact: (address: string, factId: string, at: number) => Promise<boolean>;
}

/// RC for companies, BN for business names. A bare number reads as RC.
export function normalizeRc(input: string): string | null {
  const m = /^\s*(rc|bn)?[\s-]*(\d{4,8})\s*$/i.exec(input);
  if (!m) return null;
  return `${(m[1] ?? 'rc').toUpperCase()}${m[2]}`;
}

export function createCacReview(deps: CacDeps) {
  async function submit(
    address: string,
    rcInput: string,
    claimedName: string,
  ): Promise<{ ok: true; status: 'review'; id: string } | { ok: false; reason: 'invalid_number' | 'in_use' }> {
    const rc = normalizeRc(rcInput);
    if (!rc) return { ok: false, reason: 'invalid_number' };
    const who = address.toLowerCase();
    const holder = await deps.holderOf(rc);
    if (holder && holder !== who) return { ok: false, reason: 'in_use' };
    const open = (await deps.list()).find((r) => r.address === who && r.rc === rc && r.status === 'review');
    if (open) return { ok: true, status: 'review', id: open.id };
    const id = deps.newId();
    await deps.put({ id, address: who, rc, claimedName: claimedName.trim().slice(0, 120), status: 'review', createdAt: deps.now() });
    return { ok: true, status: 'review', id };
  }

  /// One registration number backs one account: an approval claims it, and
  /// a second account's request for the same number is refused.
  async function decide(id: string, approved: boolean, reviewer: string): Promise<'decided' | 'unknown' | 'in_use'> {
    const r = await deps.get(id);
    if (!r || r.status !== 'review') return 'unknown';
    const decidedAt = deps.now();
    if (approved && !(await deps.claim(r.rc, r.address))) {
      await deps.put({ ...r, status: 'rejected', decidedAt, reviewer });
      await deps.tell(r.address, `${r.rc} already backs another Karwan account, so we could not add it to yours.`);
      return 'in_use';
    }
    await deps.put({ ...r, status: approved ? 'approved' : 'rejected', decidedAt, reviewer });
    if (approved) {
      await deps.addFact(r.address, {
        id: `cac-${r.id}`,
        kind: 'cac_match',
        level: 'human_reviewed',
        issuedAt: decidedAt,
        expiresAt: decidedAt + YEAR_MS,
        evidenceHash: evidenceHashOf('cac_match', r.rc, r.claimedName.toLowerCase()),
        source: 'cac-review',
      });
      await deps.tell(r.address, `Your registered business ${r.rc} is confirmed and on your record.`);
    } else {
      await deps.tell(
        r.address,
        `We could not match ${r.rc} to ${r.claimedName}. Check the number and the name as registered, then send them again.`,
      );
    }
    return 'decided';
  }

  /// Undoes an approval: the fact stops counting and the number is free for
  /// the business's real owner. False unless the request is approved.
  async function revoke(id: string, reviewer: string, reason: string): Promise<boolean> {
    const r = await deps.get(id);
    if (!r || r.status !== 'approved') return false;
    const revokedAt = deps.now();
    await deps.put({ ...r, status: 'revoked', revokedAt, revokedBy: reviewer, revokeReason: reason });
    await deps.revokeFact(r.address, `cac-${r.id}`, revokedAt);
    await deps.release(r.rc, r.address);
    await deps.tell(r.address, `Your registered business ${r.rc} is no longer on your record. ${reason}`);
    return true;
  }

  async function approved(): Promise<CacRequest[]> {
    return (await deps.list()).filter((r) => r.status === 'approved').sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0));
  }

  async function pending(): Promise<CacRequest[]> {
    return (await deps.list()).filter((r) => r.status === 'review').sort((a, b) => a.createdAt - b.createdAt);
  }

  return { submit, decide, revoke, approved, pending };
}
