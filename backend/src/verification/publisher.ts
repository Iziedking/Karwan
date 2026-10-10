import { logger } from '../logger.js';
import type { StoredFact } from './evidence.js';

/// The level codes written on chain. Published with the reputation model so
/// anyone reading KarwanFacts can decode them. Never renumber.
export const LEVEL_CODE: Record<StoredFact['level'], number> = {
  self_reported: 0,
  partner: 1,
  official_api: 2,
  official_record: 3,
  human_reviewed: 4,
  user_proof: 5,
  person: 6,
  id_verified: 7,
};

export interface PublisherDeps {
  /// The facts contract and the issuer wallet are both set.
  configured: boolean;
  listSubjects: () => Promise<string[]>;
  getStored: (address: string) => Promise<StoredFact[]>;
  putStored: (address: string, facts: StoredFact[]) => Promise<void>;
  /// Writes one fact and returns its id from the FactRecorded event in the
  /// receipt, or null when the receipt does not show it.
  recordOnChain: (input: {
    subject: string;
    kind: string;
    level: number;
    evidenceHash: string;
    expiresAtSec: number;
  }) => Promise<{ txHash: string; factId: string } | null>;
}

/// Writes stored facts that are not on chain yet. Idempotent: a fact is marked
/// only after its event is read back, and a failure is retried next sweep.
/// Returns how many facts were written.
export function createFactPublisher(deps: PublisherDeps) {
  return async function publishPending(now = Date.now()): Promise<number> {
    if (!deps.configured) return 0;
    let written = 0;
    for (const subject of await deps.listSubjects()) {
      const stored = await deps.getStored(subject);
      let changed = false;
      const next: StoredFact[] = [];
      for (const fact of stored) {
        if (fact.onchain || fact.expiresAt <= now || fact.level === 'self_reported') {
          next.push(fact);
          continue;
        }
        try {
          const result = await deps.recordOnChain({
            subject,
            kind: fact.kind,
            level: LEVEL_CODE[fact.level],
            evidenceHash: fact.evidenceHash,
            expiresAtSec: Math.floor(fact.expiresAt / 1000),
          });
          if (result) {
            next.push({ ...fact, onchain: { factId: result.factId, txHash: result.txHash } });
            changed = true;
            written++;
            continue;
          }
          logger.warn({ subject, factId: fact.id }, 'facts: receipt had no FactRecorded event; will retry');
        } catch (err) {
          logger.warn({ subject, factId: fact.id, err: (err as Error).message }, 'facts: write failed; will retry');
        }
        next.push(fact);
      }
      if (changed) await deps.putStored(subject, next);
    }
    return written;
  };
}
