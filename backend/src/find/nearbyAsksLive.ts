import { getBrief } from '../db/briefs.js';
import { getProfile } from '../db/profiles.js';
import { topicalMatchScore } from '../llm/keywords.js';
import { isPublic } from '../market/visibility.js';
import { sellerIndex } from '../matching/sellerIndex.js';
import { nearbyAsks, nearbySellers, type Ask, type Nearby } from './nearbyAsks.js';

/// Reads the open market for the setup card (view 39, 19 Nov). Karwan's own
/// records only; private requests and sellers off the market are never read.

const READ_MAX = 200;
const wordsOf = (text: string) => [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))];

export async function nearbyLive(me: string, role: 'sell' | 'buy', line: string, country: string, city: string | null): Promise<Nearby> {
  const words = wordsOf(line);
  const q = { me, words, country, city };
  if (!city || words.length === 0) return { count: 0, rows: [] };

  if (role === 'buy') {
    const sellers = sellerIndex
      .entries()
      .filter((s) => s.onMarket && !s.example && s.country?.toUpperCase() === country.toUpperCase() && topicalMatchScore(words, s.words) > 0)
      .slice(0, READ_MAX);
    const located = await Promise.all(
      sellers.map(async (s) => ({ user: s.userAddress, words: s.words, location: (await getProfile(s.userAddress).catch(() => null))?.location ?? null })),
    );
    return nearbySellers(located, q);
  }

  const { listOpenJobContexts } = await import('../agents/buyer.js');
  const nowSec = Math.floor(Date.now() / 1000);
  const open = listOpenJobContexts()
    .filter((j) => j.deadlineUnix > nowSec)
    .map((j) => ({ job: j, brief: getBrief(j.jobId) }))
    .filter(({ job, brief }) => brief?.postedBy && isPublic(brief) && topicalMatchScore(job.keywords?.length ? job.keywords : wordsOf(job.briefText ?? ''), words) > 0)
    .slice(0, READ_MAX);
  const asks = await Promise.all(
    open.map(async ({ job, brief }): Promise<Ask> => ({
      buyer: brief!.postedBy,
      what: (job.briefText ?? '').slice(0, 120),
      keywords: job.keywords?.length ? job.keywords : wordsOf(job.briefText ?? ''),
      budgetUsdc: Number.isFinite(Number(job.budgetUsdc)) ? Number(job.budgetUsdc) : null,
      buyerLocation: (await getProfile(brief!.postedBy).catch(() => null))?.location ?? null,
      open: true,
    })),
  );
  return nearbyAsks(asks, q);
}
