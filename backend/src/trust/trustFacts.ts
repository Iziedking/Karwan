/// Gathers what the trust engine reads about a person, from records Karwan
/// already keeps: their deals, their profile and any flagged links.

import { pgEnabled, postgresExecutor } from '../db/client.js';
import { listDealsForAddress, type DirectDeal } from '../db/deals.js';
import { getRecord } from '../db/evidence.js';
import { getProfile } from '../db/profiles.js';
import { getMaliciousLinkCount } from '../security/linkOffenses.js';
import type { StoredFact } from '../verification/evidence.js';
import { TRUST_LIMITS, type PartyFacts } from './riskEngine.js';

const DAY_MS = 86_400_000;

export function partyFactsFrom(
  address: string,
  deals: DirectDeal[],
  profileCreatedAt: number | null,
  linkOffenses: number,
  now = Date.now(),
  /// World ID passes outside direct deals: a person check, an agent deal, money out.
  passes: readonly number[] = [],
): PartyFacts {
  const me = address.toLowerCase();
  let settledDeals = 0;
  let passedAt: number | null = passes.length ? Math.max(...passes) : null;
  let lostDisputes = 0;
  let dealsLastDay = 0;
  for (const deal of deals) {
    const role = deal.buyer === me ? 'buyer' : deal.seller === me ? 'seller' : null;
    if (!role) continue;
    if (deal.settledAt && !deal.cancelledAt) settledDeals += 1;
    const check = deal.highSignalVerification?.[role];
    if (check?.status === 'verified') passedAt = Math.max(passedAt ?? 0, check.verifiedAt ?? 0);
    if (deal.disputeLoser === role) lostDisputes += 1;
    if (now - deal.createdAt < TRUST_LIMITS.fastWindowMs) dealsLastDay += 1;
  }
  return {
    settledDeals,
    worldIdPassed: passedAt !== null,
    worldIdPassedAt: passedAt,
    lostDisputes,
    dealsLastDay,
    accountAgeDays: profileCreatedAt === null ? null : Math.floor((now - profileCreatedAt) / DAY_MS),
    linkOffenses,
  };
}

/// Every time this person passed World ID outside a direct deal's own record:
/// an unexpired person or ID check, and finished session checks on agent deals
/// and money out.
async function worldIdPasses(address: string, now: number): Promise<number[]> {
  const me = address.toLowerCase();
  const facts = (await getRecord<StoredFact[]>('facts', me).catch(() => null)) ?? [];
  const out = facts
    .filter((f) => (f.kind === 'person_check' || f.kind === 'id_check') && f.level !== 'self_reported' && f.expiresAt > now)
    .map((f) => f.issuedAt);
  if (pgEnabled) {
    const rows = await postgresExecutor()
      .query<{ at: string | null }>(
        `SELECT max(completed_at) AS at FROM world_id_deal_checks_v1 WHERE wallet = $1 AND completed_at IS NOT NULL
         UNION ALL
         SELECT max(completed_at) AS at FROM world_id_account_checks_v1 WHERE wallet = $1 AND completed_at IS NOT NULL`,
        [me],
      )
      .catch(() => ({ rows: [] as { at: string | null }[] }));
    for (const r of rows.rows) if (r.at) out.push(Number(r.at));
  }
  return out;
}

export async function loadPartyFacts(address: string, now = Date.now()): Promise<PartyFacts> {
  const [deals, profile, passes] = await Promise.all([
    listDealsForAddress(address),
    getProfile(address.toLowerCase()),
    worldIdPasses(address, now),
  ]);
  return partyFactsFrom(address, deals, profile?.createdAt ?? null, getMaliciousLinkCount(address), now, passes);
}
