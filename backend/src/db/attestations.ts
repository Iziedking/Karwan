import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { eq, desc, isNotNull } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { attestations } from './schema.js';
import type { DealSettledAttestation } from '../attestation/credential.js';

const STORE_PATH = resolve(process.cwd(), 'data', 'attestations.json');

/// One issued attestation, as stored. The signed document is kept whole in
/// `document` rather than reassembled on read: the signature covers a specific
/// payload, so a stored attestation that gets rebuilt from parts on every request
/// is one refactor away from serving a proof that no longer matches what it
/// proves.
export interface IssuedAttestation {
  id: string;
  /// Lower-cased subject address, the only key a consumer looks us up by.
  subject: string;
  dealRef: string;
  /// The deal this came from. Kept off the published document on purpose (the
  /// document carries the hash), and kept here so an operator can answer "which
  /// deal is this" without reversing a keccak.
  jobId: string;
  role: 'buyer' | 'seller';
  issuedAt: number;
  /// Set only when an attestation is withdrawn. Revocations are counted on
  /// Paytag's issuer profile, so this stays null in normal operation.
  revokedAt?: number;
  revokedReason?: string;
  document: DealSettledAttestation;
}

export async function getAttestation(id: string): Promise<IssuedAttestation | null> {
  if (pgEnabled) {
    const rows = await db().select().from(attestations).where(eq(attestations.id, id));
    return rows[0]?.data ?? null;
  }
  return loadFile()[id] ?? null;
}

/// Insert-if-absent. The id is derived from the deal and the role, so a second
/// call for the same deal is the sweep re-running rather than a new statement,
/// and it must not produce a second document with a fresh `issuedAt`. Returns
/// the row that ended up stored, and whether this call is what created it.
export async function saveAttestation(
  row: IssuedAttestation,
): Promise<{ attestation: IssuedAttestation; created: boolean }> {
  const existing = await getAttestation(row.id);
  if (existing) return { attestation: existing, created: false };

  if (pgEnabled) {
    const inserted = await db()
      .insert(attestations)
      .values({
        id: row.id,
        subject: row.subject,
        dealRef: row.dealRef,
        issuedAt: row.issuedAt,
        revokedAt: row.revokedAt ?? null,
        data: row,
      })
      .onConflictDoNothing({ target: attestations.id })
      .returning();
    // Empty means a concurrent tick won the insert. Read theirs rather than
    // claiming ours: two backend instances sweeping at once is normal, and the
    // stored document is the one that was published.
    if (inserted.length === 0) {
      const winner = await getAttestation(row.id);
      return { attestation: winner ?? row, created: false };
    }
    return { attestation: row, created: true };
  }

  const store = loadFile();
  store[row.id] = row;
  saveFile(store);
  return { attestation: row, created: true };
}

/// Everything Karwan has said about one address, newest first. Revoked rows are
/// included; the document's own `status` block is what tells a consumer where to
/// check, and silently dropping a revoked attestation would hide the withdrawal
/// from anyone who already holds a copy.
export async function listAttestationsForSubject(
  subject: string,
): Promise<IssuedAttestation[]> {
  const key = subject.toLowerCase();
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(attestations)
      .where(eq(attestations.subject, key))
      .orderBy(desc(attestations.issuedAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((a) => a.subject === key)
    .sort((x, y) => y.issuedAt - x.issuedAt);
}

export async function listRevokedAttestations(): Promise<IssuedAttestation[]> {
  if (pgEnabled) {
    const rows = await db()
      .select()
      .from(attestations)
      .where(isNotNull(attestations.revokedAt))
      .orderBy(desc(attestations.revokedAt));
    return rows.map((r) => r.data);
  }
  return Object.values(loadFile())
    .filter((a) => a.revokedAt)
    .sort((x, y) => (y.revokedAt ?? 0) - (x.revokedAt ?? 0));
}

export async function countAttestations(): Promise<number> {
  if (pgEnabled) {
    const rows = await db().select({ id: attestations.id }).from(attestations);
    return rows.length;
  }
  return Object.keys(loadFile()).length;
}

/// Withdraw an attestation. Deliberately not exposed on a public route: this is
/// an incident path, reached through the admin surface, because Paytag publishes
/// a revocation count against the issuer and a workflow that revokes routinely
/// is an issuer nobody should consume.
export async function revokeAttestation(
  id: string,
  reason: string,
): Promise<IssuedAttestation | null> {
  const existing = await getAttestation(id);
  if (!existing) return null;
  if (existing.revokedAt) return existing;
  const next: IssuedAttestation = {
    ...existing,
    revokedAt: Date.now(),
    revokedReason: reason,
  };
  if (pgEnabled) {
    await db()
      .update(attestations)
      .set({ revokedAt: next.revokedAt, data: next })
      .where(eq(attestations.id, id));
    return next;
  }
  const store = loadFile();
  store[id] = next;
  saveFile(store);
  return next;
}

// Flat-file

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, IssuedAttestation> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, IssuedAttestation>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, IssuedAttestation>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
