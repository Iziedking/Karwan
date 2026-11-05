import { agentJobs } from '../agentJobs/agentJobsLive.js';
import { sealedSellers } from '../agents/sealedSellers.js';
import { sealedSellerDeps } from '../agents/sealedSellersLive.js';
import { config } from '../config.js';
import { findProfileByHandle, getProfile } from '../db/profiles.js';
import { logger } from '../logger.js';
import { checkPerson } from '../lookup/checkPerson.js';
import { rankSellers, sellerIndex } from '../matching/sellerIndex.js';
import { mayReadOutside } from '../reputation/consent.js';
import { loadPublicPassport } from '../sealed/passportLoader.js';
import { levelOf } from '../verification/live.js';
import { findForAgent } from './match.js';
import { createPaidTools } from './payments.js';
import type { McpDeps } from './server.js';

/// The Karwan MCP bound to the live cores. Null where outside-agent jobs are
/// off. Paid tools stay off, and say so, when the treasury or Gateway is not
/// reachable at boot.
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
        async sellers(request) {
          if (!sellerIndex.isBuilt()) await sellerIndex.rebuild();
          return rankSellers(sellerIndex.entries(), request).byWords;
        },
        profile: (user) => getProfile(user),
        seal: (i) => sealedSellers(i, sealedSellerDeps, Date.now()),
        nowMs: Date.now(),
      }),
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
