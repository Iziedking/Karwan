import type { DealKind } from '../chain/agreementTerms.js';

/// The deals Karwan refuses because their shape takes away the buyer's
/// protection (view 32, decision 6). Two more rules there need no code here:
/// the escrow never pays a seller before a delivery, and a seller who lost two
/// disputes is already asked for a deal guarantee by the trust engine. There is
/// no price rule: Karwan judges a deal against what the two agreed.

export const DEAL_RULE_LIMITS = { newSellerMaxUsdc: 100, goodsProofOverUsdc: 50 } as const;

export type DealRule = 'new_unverified_over_100' | 'goods_no_way_to_show';

export type RuleVerdict = { verdict: 'ok' } | { verdict: 'refuse'; rule: DealRule; words: string; fix: string };

export interface DealRuleInput {
  amountUsdc: number;
  kind: DealKind;
  /// How goods reach the buyer, chosen on the deal.
  goodsWay: 'shipped' | 'in_person' | null;
  /// Null while an invited seller has not joined.
  seller: { settledDeals: number; verified: boolean } | null;
}

export function checkDealRules(input: DealRuleInput): RuleVerdict {
  const s = input.seller;
  if (s && s.settledDeals === 0 && !s.verified && input.amountUsdc > DEAL_RULE_LIMITS.newSellerMaxUsdc) {
    return {
      verdict: 'refuse',
      rule: 'new_unverified_over_100',
      words: `A seller with no finished deal and no verification can take up to ${DEAL_RULE_LIMITS.newSellerMaxUsdc} USDC.`,
      fix: 'They can verify with World ID, or finish a smaller deal first.',
    };
  }
  if (input.kind === 'goods' && !input.goodsWay && input.amountUsdc > DEAL_RULE_LIMITS.goodsProofOverUsdc) {
    return {
      verdict: 'refuse',
      rule: 'goods_no_way_to_show',
      words: `Goods over ${DEAL_RULE_LIMITS.goodsProofOverUsdc} USDC need a way to show they arrived.`,
      fix: 'Choose shipped, with a tracking number at delivery, or handed over in person.',
    };
  }
  return { verdict: 'ok' };
}
