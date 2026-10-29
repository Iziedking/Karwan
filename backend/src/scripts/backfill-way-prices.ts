/// Give every saved selling way a usual price (view 41, phase 2).
///
/// Until 29 Oct 2026 a selling way carried a price range, lowest to highest,
/// and the highest was a cap: a request above it was skipped. Prices are a
/// starting point now: a way carries the lowest price the person takes and
/// their usual price, and there is no highest. A saved range becomes lowest =
/// its low end and usual = its midpoint; one price is both. The older seller
/// settings follow the ways, as they do on every save.
///
/// Nothing is guessed beyond that rule, and running it twice changes nothing:
/// a way that already has a usual price is left alone.
///
/// Run once after deploying the change, inside the api container:
///   DRY_RUN=1 node dist/scripts/backfill-way-prices.js   (preview)
///   node dist/scripts/backfill-way-prices.js             (apply)

import { listProfiles, updateProfile, type UserProfile } from '../db/profiles.js';
import { legacyFromWays, upgradeWays, waysSchema, type AgentWays } from '../agents/ways.js';
import { logger } from '../logger.js';

const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

export interface WayPriceChange {
  address: string;
  before: unknown;
  after: AgentWays;
  seller: UserProfile['seller'];
}

/// The profiles whose saved ways still carry a range, with what they become.
/// Profiles without ways, and ways already in the new shape, are left out.
export function planWayPriceBackfill(profiles: readonly UserProfile[]): WayPriceChange[] {
  const changes: WayPriceChange[] = [];
  for (const p of profiles) {
    if (!p.agentWays) continue;
    const upgraded = upgradeWays(p.agentWays);
    if (JSON.stringify(upgraded) === JSON.stringify(p.agentWays)) continue;
    const parsed = waysSchema.safeParse(upgraded);
    if (!parsed.success) {
      logger.warn({ address: p.address, issues: parsed.error.issues.map((i) => i.message) }, 'way price backfill: ways do not parse, skipped');
      continue;
    }
    changes.push({ address: p.address, before: p.agentWays, after: parsed.data, seller: legacyFromWays(parsed.data, p).seller });
  }
  return changes;
}

async function main() {
  const plan = planWayPriceBackfill(await listProfiles());
  logger.info({ changes: plan.length, dryRun }, 'way price backfill: planned');
  for (const change of plan) {
    logger.info({ address: change.address, before: change.before, after: change.after }, 'way price backfill: change');
    if (dryRun) continue;
    await updateProfile(change.address, (current) => ({
      ...current,
      agentWays: change.after,
      ...(change.seller ? { seller: change.seller } : {}),
      updatedAt: Date.now(),
    }));
  }
  logger.info({ applied: dryRun ? 0 : plan.length, dryRun }, 'way price backfill: done');
}

if (process.argv[1]?.endsWith('backfill-way-prices.js') || process.argv[1]?.endsWith('backfill-way-prices.ts')) {
  main().then(
    () => process.exit(0),
    (err) => {
      logger.error({ err: (err as Error).message }, 'way price backfill failed');
      process.exit(1);
    },
  );
}
