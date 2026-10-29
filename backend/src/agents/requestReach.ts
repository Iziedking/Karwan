/// Where a buyer's request stands with the sellers who fit it (view 41): counts
/// and states only, never a seller's name or price before they offer. When a
/// minute has passed and nobody fits, the buyer is told plainly instead of
/// watching a page that only says it is reviewing.

import { getBrief } from '../db/briefs.js';

export const NOBODY_AFTER_MS = 60_000;

export interface RequestReach {
  /// Sellers who fit: those who offered plus those being asked.
  fit: number;
  offered: number;
  asked: number;
  /// True once a minute has passed with nobody who fits.
  nobodyYet: boolean;
}

export function requestReach(input: {
  offeredSellers: readonly string[];
  askedSellers: readonly string[];
  postedAt: number;
  now: number;
}): RequestReach {
  const offered = new Set(input.offeredSellers.map((s) => s.toLowerCase()));
  const asked = new Set(input.askedSellers.map((s) => s.toLowerCase()).filter((s) => !offered.has(s)));
  const fit = offered.size + asked.size;
  return { fit, offered: offered.size, asked: asked.size, nobodyYet: fit === 0 && input.now - input.postedAt >= NOBODY_AFTER_MS };
}

/// The live reach of one request, read from the buyer's agent and the open
/// questions. Null when the request is unknown here.
export async function loadRequestReach(jobId: string, now = Date.now()): Promise<RequestReach | null> {
  const [{ getBuyerJob }, { openQuestionsOnJob }] = await Promise.all([import('./buyer.js'), import('../db/agentQuestions.js')]);
  const brief = getBrief(jobId);
  const job = getBuyerJob(jobId);
  if (!brief || !job) return null;
  const asked = (await openQuestionsOnJob(jobId, now)).filter((q) => q.side === 'seller').map((q) => q.owner);
  return requestReach({ offeredSellers: job.bids.map((b) => b.seller), askedSellers: asked, postedAt: brief.createdAt, now });
}

/// The reach as the request page reads it: the poster sees it, everyone else
/// and a signed-out visitor get nothing, so the counts never reach a seller.
export async function reachForViewer(
  jobId: string,
  caller: string | null,
  deps: { postedBy: (jobId: string) => string | null | undefined; load: (jobId: string) => Promise<RequestReach | null> } = {
    postedBy: (id) => getBrief(id)?.postedBy,
    load: loadRequestReach,
  },
): Promise<RequestReach | null> {
  const poster = deps.postedBy(jobId);
  if (!caller || !poster || poster.toLowerCase() !== caller.toLowerCase()) return null;
  return deps.load(jobId);
}
