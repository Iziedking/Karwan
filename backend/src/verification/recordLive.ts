import { ARC } from '../chain/client.js';
import { config } from '../config.js';
import { findProfileByHandle } from '../db/profiles.js';
import type { RecordDeps } from '../routes/record.js';
import { readSession } from '../auth/session.js';
import { loadPublicPassport } from '../sealed/passportLoader.js';
import { buildRecordCredential } from './credential.js';
import { factsFor } from './evidence.js';
import { ladderFor } from './ladder.js';
import { evidenceDeps } from './live.js';
import { listDealsForAddress } from '../db/deals.js';
import { compute } from '../reputation/engine.js';
import { loadInputs } from '../reputation/signals.js';
import { countsFor } from '../reputation/recordRead.js';

const NO_CONTRACT = '0x0000000000000000000000000000000000000000';

async function recordFacts(address: string, now: number) {
  const facts = await factsFor(address, evidenceDeps, now);
  return facts.map((f) => {
    const stored = f as typeof f & { onchain?: { txHash: string } };
    return {
      kind: f.kind,
      level: String(f.level),
      issuedAt: f.issuedAt,
      expiresAt: f.expiresAt,
      ...(stored.onchain?.txHash ? { txHash: stored.onchain.txHash } : {}),
    };
  });
}

export const recordDeps: RecordDeps = {
  now: Date.now,
  sealed: () => config.SEALED_RECORDS,
  viewer: (c) => readSession(c)?.address ?? null,
  addressOfTag: async (tag) => (await findProfileByHandle(tag))?.address?.toLowerCase() ?? null,
  passport: async (address) => {
    const p = await loadPublicPassport(address);
    return { displayName: p.displayName, tag: p.tag, tier: p.tier, reasons: p.reasons };
  },
  level: async (address) => {
    const now = Date.now();
    return ladderFor(await factsFor(address, evidenceDeps, now), now);
  },
  facts: (address) => recordFacts(address, Date.now()),
  summary: async (address) => {
    const [inputs, deals] = await Promise.all([loadInputs(address), listDealsForAddress(address).catch(() => [])]);
    const counts = countsFor(deals, address);
    return {
      score: Math.round(compute(inputs).score / 10),
      counts: { completed: counts.completed, onTimeRate: counts.onTimeRate, disputesLost: counts.disputesLost },
    };
  },
  credential: async (address) => {
    const now = Date.now();
    const [p, facts] = await Promise.all([loadPublicPassport(address), factsFor(address, evidenceDeps, now)]);
    return buildRecordCredential({
      subject: address,
      level: ladderFor(facts, now),
      tier: p.tier,
      reasons: p.reasons,
      facts: await recordFacts(address, now),
      chainId: ARC.chainId,
      factsContract: config.KARWAN_FACTS_ADDR ?? NO_CONTRACT,
      now,
    });
  },
};
