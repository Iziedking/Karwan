import { createHash } from 'node:crypto';
import type { Fact } from './ladder.js';

const YEAR_MS = 365 * 24 * 3_600_000;

/// A verified fact as Karwan keeps it. `evidenceHash` fingerprints what was
/// checked, so the same evidence never adds a second fact; it is also what
/// goes on chain, never the evidence itself.
export interface StoredFact extends Fact {
  id: string;
  evidenceHash: string;
  /// Where it came from: 'whatsapp', 'x', 'world-id', 'cac-review'.
  source: string;
  onchain?: { factId: string; txHash: string };
}

export interface EvidenceDeps {
  getStored: (address: string) => Promise<StoredFact[]>;
  putStored: (address: string, facts: StoredFact[]) => Promise<void>;
  profile: (address: string) => Promise<{ xUserId?: string } | null>;
  settledDeals: (address: string) => Promise<number>;
}

/// Facts Karwan already knows without the person sending anything: an X
/// account they signed in with, and deals that settled in escrow. Derived on
/// every read, so they follow the account as it is now.
function derived(input: { xUserId?: string; settled: number }, now: number): Fact[] {
  const out: Fact[] = [];
  if (input.xUserId) out.push({ kind: 'owned_account', level: 'official_api', issuedAt: now, expiresAt: now + YEAR_MS });
  if (input.settled > 0) out.push({ kind: 'karwan_deal', level: 'partner', issuedAt: now, expiresAt: now + YEAR_MS });
  return out;
}

export async function factsFor(address: string, deps: EvidenceDeps, now: number): Promise<Fact[]> {
  const key = address.toLowerCase();
  const [stored, profile, settled] = await Promise.all([
    deps.getStored(key),
    deps.profile(key).catch(() => null),
    deps.settledDeals(key).catch(() => 0),
  ]);
  return [...stored, ...derived({ xUserId: profile?.xUserId, settled }, now)];
}

/// False when this evidence already backs a fact on the account.
export async function addFact(address: string, fact: StoredFact, deps: EvidenceDeps): Promise<boolean> {
  const key = address.toLowerCase();
  const stored = await deps.getStored(key);
  if (stored.some((f) => f.evidenceHash === fact.evidenceHash && f.kind === fact.kind)) return false;
  await deps.putStored(key, [...stored, fact]);
  return true;
}

export function evidenceHashOf(...parts: string[]): string {
  return `0x${createHash('sha256').update(parts.join('|')).digest('hex')}`;
}

/// What the public reasons may say about verified evidence.
export function sealedExtras(facts: readonly Fact[], now: number) {
  const valid = facts.filter((f) => f.expiresAt > now && f.level !== 'self_reported');
  const has = (kind: Fact['kind'], test: (f: Fact) => boolean = () => true) => valid.some((f) => f.kind === kind && test(f));
  return {
    clientConfirmed: has('client_confirmation', (f) => f.independent === true),
    registeredBusiness: has('cac_match'),
    githubWork: has('github_work'),
    personVerified: has('person_check'),
  };
}
