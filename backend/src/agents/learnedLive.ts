import { getProfile } from '../db/profiles.js';
import { recentAnsweredFor } from '../db/agentQuestions.js';
import { listDealsForAddress } from '../db/deals.js';
import { getBrief } from '../db/briefs.js';
import { learnedSuggestions, type AnsweredQuestion, type SettledDeal, type Suggestion } from './learned.js';
import { waysOf } from './ways.js';

/// The person's own history, read for the learned suggestions (view 41): the
/// questions they answered, the deals they settled as the seller, and the ways
/// they have. Nothing here writes.
export async function learnedFor(address: string): Promise<Suggestion[]> {
  const me = address.toLowerCase();
  const profile = await getProfile(me);
  if (!profile) return [];
  const ways = waysOf(profile);
  const answered: AnsweredQuestion[] = (await recentAnsweredFor(me, 50))
    .filter((q) => q.side === 'seller' && q.answer)
    .map((q) => ({
      kind: q.kind,
      choice: q.answer!.choice,
      budgetUsdc: q.facts.budgetUsdc ? Number(q.facts.budgetUsdc) : null,
      priceUsdc: q.answer!.priceUsdc ? Number(q.answer!.priceUsdc) : q.answer!.choice === 'yes' && q.suggested.priceUsdc ? Number(q.suggested.priceUsdc) : null,
      tradeType: getBrief(q.jobId)?.tradeType ?? null,
      title: q.title,
    }));
  const settled: SettledDeal[] = (await listDealsForAddress(me).catch(() => []))
    .filter((d) => d.seller.toLowerCase() === me && d.settledAt && !d.cancelledAt)
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0))
    .map((d) => ({ priceUsdc: Number(d.dealAmountUsdc), tradeType: getBrief(d.jobId)?.tradeType ?? null }));
  const noAsk = ways.sell.map((w) => (w.shape === 'deposit' ? 0 : w.noAskBelow ?? 0)).reduce((m, n) => Math.max(m, n), 0);
  return learnedSuggestions({
    ways,
    noAskBelowUsdc: noAsk || null,
    dismissed: profile.agentPrefs?.dismissedSuggestions ?? [],
    answered,
    settled,
  });
}
