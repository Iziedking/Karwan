import { isVerified } from '../agents/shortlist.js';
import { dealRulesState } from '../db/dealRulesSwitch.js';
import type { DirectDeal } from '../db/deals.js';
import { logger } from '../logger.js';
import { loadPartyFacts } from '../trust/trustFacts.js';
import { levelOf } from '../verification/live.js';
import { dealKindOf } from './dealKind.js';
import { checkDealRules, type RuleVerdict } from './dealRules.js';

const PENDING = /^0x0{40}$/i;

/// The rules at the step that puts money in (view 32). With the switch off a
/// refusal is only logged, so the deal goes ahead.
export async function dealRuleRefusal(deal: DirectDeal): Promise<Extract<RuleVerdict, { verdict: 'refuse' }> | null> {
  const sellerKnown = !!deal.seller && !PENDING.test(deal.seller);
  const seller = sellerKnown
    ? await Promise.all([loadPartyFacts(deal.seller), levelOf(deal.seller)]).then(([f, level]) => ({
      settledDeals: f.settledDeals,
      verified: f.worldIdPassed || isVerified(level),
    }))
    : null;
  const verdict = checkDealRules({ amountUsdc: Number(deal.dealAmountUsdc), kind: dealKindOf(deal), goodsWay: deal.goodsWay ?? null, seller });
  if (verdict.verdict === 'ok') return null;
  const { on } = await dealRulesState();
  logger.info({ jobId: deal.jobId, rule: verdict.rule, enforced: on }, on ? 'deal rule refused funding' : 'deal rule would refuse funding (switch off)');
  return on ? verdict : null;
}
