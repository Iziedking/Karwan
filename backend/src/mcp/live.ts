import { agentJobs } from '../agentJobs/agentJobsLive.js';
import { config } from '../config.js';
import { findProfileByHandle } from '../db/profiles.js';
import { logger } from '../logger.js';
import { checkPerson } from '../lookup/checkPerson.js';
import { directoryCandidates } from '../find/directory.js';
import { liveDirectoryDeps } from '../find/directoryLive.js';
import { mayReadOutside } from '../reputation/consent.js';
import { loadPublicPassport } from '../sealed/passportLoader.js';
import { levelOf } from '../verification/live.js';
import { findForAgent } from './match.js';
import { createPaidTools } from './payments.js';
import { windowLimiter } from './rateLimit.js';
import { loadRatingForWork } from '../ratings/publicRating.js';
import { readRating } from '../ratings/readRating.js';
import type { McpDeps } from './server.js';

/// The Karwan MCP bound to the live cores. Null where outside-agent jobs are
/// off. Paid tools stay off, and say so, when the treasury or Gateway is not
/// reachable at boot.
/// The free rating read: 60 a minute for each outside agent (view 93).
const ratingAllowed = windowLimiter(60, 60_000);

export async function liveMcpDeps(): Promise<McpDeps | null> {
  if (!agentJobs) return null;
  const paid = config.KARWAN_TREASURY_ADDR
    ? await createPaidTools(config.KARWAN_TREASURY_ADDR).catch((err) => {
        logger.warn({ err: (err as Error).message }, 'mcp: paid tools not ready');
        return null;
      })
    : null;
  return {
    core: agentJobs,
    paid,
    find: (input) =>
      findForAgent(input, {
        candidates: (need) => directoryCandidates(need, liveDirectoryDeps),
        cleanRecordCounts: config.ARC_NETWORK === 'testnet',
        requireVerified: false,
      }),
    rating: (handle, forWork) =>
      readRating(handle, forWork, {
        byTag: async (tag) => (await findProfileByHandle(tag).catch(() => null))?.address ?? null,
        load: (address, request) => loadRatingForWork(address, request),
      }),
    ratingAllowed,
    async check(handle) {
      const tag = handle.replace(/^@/, '').trim();
      const profile = await findProfileByHandle(tag).catch(() => null);
      const found = await checkPerson(tag, {
        resolve: async () => (profile?.address ? { address: profile.address, via: 'tag' } : null),
        passport: loadPublicPassport,
        level: (who) => levelOf(who),
      });
      if (!found.found) return { ok: true, found: false, next: 'No Karwan member has that tag.' };
      // With their yes, how they are verified too; still never a score or counts (D23).
      const level = mayReadOutside(profile) ? { level: await levelOf(profile!.address) } : {};
      return { ok: true, ...found, ...level };
    },
  };
}
