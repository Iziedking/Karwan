import { listProfiles } from '../db/profiles.js';
import { readSharedRates } from '../rates/sharedRate.js';
import { patchForWays } from '../routes/setup.js';
import { leased } from '../ops/leasedLoop.js';
import { logger } from '../logger.js';
import { refreshSaidWays } from './waysSaid.js';
import { refreshSaidLimits } from './agentLimit.js';
import { listAgentRecords, updateAgentRecord } from '../db/agentRecords.js';

/// Keeps every agent's typed prices true in the currency they were typed in
/// (view 77). The shared rate changes at the start of a day, or on a move
/// above half a percent; soon after, each rule's USDC is worked out again.

const TICK_MS = 15 * 60_000;
let appliedAt: number | null = null;

async function tick(): Promise<void> {
  const rates = await readSharedRates();
  if (rates.updatedAt === null || rates.updatedAt === appliedAt) return;
  const { liveSetupDeps } = await import('../setup/live.js');
  const changed = await refreshSaidWays({
    list: listProfiles,
    rates: async () => rates,
    save: async (profile, ways) => {
      await liveSetupDeps.save(profile.address, patchForWays(ways, profile));
    },
  });
  // A weekly limit said in their own currency follows the same rule.
  const limits = await refreshSaidLimits({ list: listAgentRecords, rates: async () => rates, save: updateAgentRecord });
  if (limits) logger.info({ accounts: limits, rateSetAt: rates.updatedAt }, 'said weekly limits brought to the new shared rate');
  appliedAt = rates.updatedAt;
  if (changed) logger.info({ accounts: changed, rateSetAt: rates.updatedAt }, 'typed agent prices brought to the new shared rate');
}

export function startSaidWaysRefresh(): () => void {
  const run = leased('saidWaysRefresh', TICK_MS, () =>
    tick().catch((err: unknown) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'typed agent prices refresh failed; rules keep their last USDC');
    }),
  );
  const first = setTimeout(() => void run(), 60_000);
  const id = setInterval(() => void run(), TICK_MS);
  return () => {
    clearTimeout(first);
    clearInterval(id);
  };
}
