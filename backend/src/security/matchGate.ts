import type { MatchProposal } from '../db/matchProposals.js';
import { actorSignalsFor, type RepTier } from '../agents/signals.js';
import { getLinkOffenseCount } from './linkOffenses.js';

/// Security screen on an agent-proposed match, run before the deal is persisted
/// (audit/AGENTIC_WORKFLOW_REVIEW.md — the SA hold stubs had no call sites). It
/// is DETERMINISTIC and consumes signals the agents ALREADY gathered — the paid
/// counterparty passport (proposal.paidSignal) and the paid market read
/// (proposal.marketRead) both bought during negotiation, plus free on-platform
/// risk features — so it costs nothing extra and never blocks a match on an LLM
/// guess. It only screens; the human already approved, so a 'flag' surfaces a
/// banner and a 'hold' marks the deal for review. It never auto-declines and
/// never confiscates — money stays safely escrowed either way.
export type MatchDecision = 'pass' | 'flag' | 'hold';

/// Who a risk line is FOR. A "buyer is new" warning is for the seller deciding
/// whether to trust an unproven buyer, not for the buyer (who reads it as the
/// product accusing them). 'both' is a shared concern (off-market price, a hold).
/// The deal page shows a viewer only the lines whose audience is their role or
/// 'both', so each side reads a summary that fits its own situation.
export type MatchAudience = 'buyer' | 'seller' | 'both';

export interface MatchReason {
  text: string;
  audience: MatchAudience;
}

export interface MatchVerdict {
  decision: MatchDecision;
  /// Machine tags for the surfaced risk(s), e.g. 'link-offense', 'velocity'.
  flags: string[];
  /// One plain-language line for the audit event (the first / most severe reason).
  reason: string;
  /// Per-flag explanations, each tagged with the party it is for.
  reasons: MatchReason[];
  /// True when the verdict weighed paid evidence (passport and/or market read),
  /// so the receipt can show the screen was backed by paid data, not free reads.
  paidConsulted: boolean;
  evaluatedAt: number;
}

const SPAM_VELOCITY = 20;
const LARGE_DEAL_USDC = 1000;
/// A price this far below the grounded market reads as a probe / underpricing.
const PRICE_BAND_FLOOR = 0.65; // 35% under fair price

function unproven(tier: RepTier): boolean {
  return tier === 'new' || tier === 'cold';
}

export async function evaluateMatch(proposal: MatchProposal): Promise<MatchVerdict> {
  const flags: string[] = [];
  const reasons: MatchReason[] = [];
  let hold = false;

  const price = Number(proposal.raisedPriceUsdc ?? proposal.agreedPriceUsdc);

  // 1. Prior unsafe-link offenses. A party's own record is a warning for the
  //    OTHER side (the party knows their own history), so it is addressed to the
  //    counterparty. Either present holds the match for review.
  const buyerOffenses =
    getLinkOffenseCount(proposal.buyerUser) + getLinkOffenseCount(proposal.buyerAgent);
  const sellerOffenses =
    getLinkOffenseCount(proposal.sellerUser) + getLinkOffenseCount(proposal.sellerAgent);
  if (buyerOffenses > 0) {
    flags.push('link-offense');
    reasons.push({ text: `The buyer has prior unsafe-link offenses on record (${buyerOffenses}).`, audience: 'seller' });
    hold = true;
  }
  if (sellerOffenses > 0) {
    flags.push('link-offense');
    reasons.push({ text: `The seller has prior unsafe-link offenses on record (${sellerOffenses}).`, audience: 'buyer' });
    hold = true;
  }

  // 2. Velocity: high 24h activity reads as a bot signal ONLY for an unproven
  //    account. A proven seller (ELITE/STRONG with real settled deals) is simply
  //    busy, not a bot, so their volume never flags — otherwise the screen would
  //    warn a buyer that a highly-reputable counterparty is suspicious. The hot
  //    party is the concern for the OTHER side, so the line is addressed there.
  const [buyerSig, sellerSig] = await Promise.all([
    actorSignalsFor(proposal.buyerAgent),
    actorSignalsFor(proposal.sellerAgent),
  ]);
  const buyerHot = buyerSig.velocity24h >= SPAM_VELOCITY && unproven(buyerSig.repTier);
  const sellerHot = sellerSig.velocity24h >= SPAM_VELOCITY && unproven(sellerSig.repTier);
  if (buyerHot || sellerHot) {
    flags.push('velocity');
    if (buyerHot && sellerHot) {
      reasons.push({
        text: `Elevated 24h activity from both agents (buyer ${buyerSig.velocity24h}, seller ${sellerSig.velocity24h}) — possible bots.`,
        audience: 'both',
      });
    } else if (buyerHot) {
      reasons.push({ text: `Elevated buyer activity (${buyerSig.velocity24h} in 24h) — possible bot.`, audience: 'seller' });
    } else {
      reasons.push({ text: `Elevated seller activity (${sellerSig.velocity24h} in 24h) — possible bot.`, audience: 'buyer' });
    }
  }

  // 3. Tier vs size: a large deal with an unproven counterparty. Addressed to
  //    the side facing the unproven party.
  if (Number.isFinite(price) && price >= LARGE_DEAL_USDC) {
    const buyerUnproven = unproven(buyerSig.repTier);
    const sellerUnproven = unproven(sellerSig.repTier);
    if (buyerUnproven || sellerUnproven) {
      flags.push('tier-vs-size');
      if (buyerUnproven && sellerUnproven) {
        reasons.push({ text: `Large deal (${price} USDC) and both sides are unproven.`, audience: 'both' });
      } else if (buyerUnproven) {
        reasons.push({ text: `Large deal (${price} USDC) with an unproven buyer.`, audience: 'seller' });
      } else {
        reasons.push({ text: `Large deal (${price} USDC) with an unproven seller.`, audience: 'buyer' });
      }
    }
  }

  // 4. Price far below the grounded market band — a shared signal either side
  //    should note (a probe, or a too-good-to-be-true price).
  const fair = proposal.marketRead?.fairPriceUsdc;
  if (fair && fair > 0 && Number.isFinite(price) && price < fair * PRICE_BAND_FLOOR) {
    flags.push('price-below-band');
    reasons.push({
      text: `Agreed price ${price} USDC is ${Math.round((1 - price / fair) * 100)}% below the grounded market (${fair} USDC).`,
      audience: 'both',
    });
  }

  // 5. Negotiation-time risk classification (signals.ts). new-buyer / lowball are
  //    about the buyer, so they warn the seller; the rest are shared. A
  //    concentration-high or honey-trap escalates to hold.
  if (proposal.riskFlag) {
    flags.push(proposal.riskFlag);
    if (proposal.riskNote) {
      const audience: MatchAudience =
        proposal.riskFlag === 'new-buyer' || proposal.riskFlag === 'lowball' ? 'seller' : 'both';
      reasons.push({ text: proposal.riskNote, audience });
    }
    if (proposal.riskFlag === 'concentration-high' || proposal.riskFlag === 'honey-trap') hold = true;
  }

  const decision: MatchDecision = flags.length === 0 ? 'pass' : hold ? 'hold' : 'flag';
  return {
    decision,
    flags: [...new Set(flags)],
    reason: reasons[0]?.text ?? 'No risk signals.',
    reasons,
    paidConsulted: !!(proposal.paidSignal || proposal.marketRead),
    evaluatedAt: Date.now(),
  };
}
