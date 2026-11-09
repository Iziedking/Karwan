import { isPriced, waysOf } from '../agents/ways.js';
import { getBrief } from '../db/briefs.js';
import { getProfile } from '../db/profiles.js';
import { topicalMatchScore } from '../llm/keywords.js';
import { isPublic } from '../market/visibility.js';
import { requestsForSeller, sellerIndex } from '../matching/sellerIndex.js';
import { liveDirectoryDeps } from './directoryLive.js';
import { openNeeds } from './needs.js';
import type { LeadCandidate, LeadSeller } from './rankBuyers.js';
import { contactFromOf, meetOf, reachableOf } from './settings.js';

/// What a seller's agent reads to find buyers (view 72, Phase 4): open
/// requests on the market that share words with what they sell, and the
/// needs of buyers who let sellers reach them. Karwan's own records only, so
/// it costs nothing. Private requests are never read here.

const READ_MAX = 20;
const DAY_SECONDS = 86_400;
const keywordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

export async function customerLeads(user: string): Promise<{ seller: LeadSeller | null; leads: LeadCandidate[] }> {
  const me = user.toLowerCase();
  const entry = sellerIndex.get(me) ?? (await sellerIndex.refresh(me));
  const profile = await getProfile(me).catch(() => null);
  if (!entry || !profile?.seller) return { seller: null, leads: [] };
  const prices = waysOf(profile).sell.filter(isPriced).map((w) => w.priceMin);
  const seller: LeadSeller = {
    user: me,
    words: entry.words,
    meet: meetOf(profile),
    location: profile.location ?? null,
    verified: (await liveDirectoryDeps.record(me).catch(() => null))?.verified ?? false,
    priceMin: prices.length ? Math.min(...prices) : null,
  };

  const { listOpenJobContexts } = await import('../agents/buyer.js');
  const nowSec = Math.floor(Date.now() / 1000);
  const open = listOpenJobContexts().filter((j) => j.deadlineUnix > nowSec && isPublic(getBrief(j.jobId) ?? {}));
  const requests = requestsForSeller(
    entry,
    open.map((j) => {
      const brief = getBrief(j.jobId);
      return { jobId: j.jobId, keywords: j.keywords, briefText: j.briefText, sourcingSector: j.sourcingSector ?? null, tradeType: brief?.tradeType ?? null, where: brief?.where ?? null };
    }),
    READ_MAX,
  );
  const needs = (await openNeeds())
    .filter((n) => n.owner !== me && topicalMatchScore(keywordsOf(n.what), entry.words) > 0)
    .slice(0, READ_MAX);

  const buyerOf = async (address: string) => {
    const [p, record] = await Promise.all([getProfile(address).catch(() => null), liveDirectoryDeps.record(address).catch(() => null)]);
    return { profile: p, verified: record?.verified ?? false, tier: record?.tier ?? 'NEW' as const };
  };

  const fromRequests = await Promise.all(requests.map(async (r): Promise<LeadCandidate | null> => {
    const job = open.find((j) => j.jobId === r.jobId);
    const brief = getBrief(r.jobId);
    if (!job || !brief?.postedBy) return null;
    const b = await buyerOf(brief.postedBy);
    return {
      kind: 'request', ref: r.jobId, buyer: brief.postedBy, what: (job.briefText ?? '').slice(0, 160), keywords: job.keywords ?? [],
      budgetUsdc: Number(job.budgetUsdc), every: null, deliveryKind: brief.deliveryKind ?? 'remote', where: brief.where ?? { scope: 'anywhere' },
      buyerLocation: b.profile?.location ?? null, buyerVerified: b.verified, buyerTier: b.tier,
      dueDays: Math.max(1, Math.ceil((job.deadlineUnix - nowSec) / DAY_SECONDS)), open: isPublic(brief), contactFrom: 'anyone',
    };
  }));
  const fromNeeds = await Promise.all(needs.map(async (n): Promise<LeadCandidate> => {
    const b = await buyerOf(n.owner);
    return {
      kind: 'need', ref: n.id, buyer: n.owner, what: n.what, keywords: keywordsOf(n.what),
      budgetUsdc: n.budgetUsdc ? Number(n.budgetUsdc) : null, every: n.every, deliveryKind: n.kind, where: { scope: 'near' },
      buyerLocation: b.profile?.location ?? null, buyerVerified: b.verified, buyerTier: b.tier, dueDays: null,
      open: !n.paused && !!b.profile && reachableOf(b.profile), contactFrom: b.profile ? contactFromOf(b.profile) : 'anyone',
    };
  }));
  return { seller, leads: [...fromRequests.filter((l): l is LeadCandidate => l !== null), ...fromNeeds] };
}
