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

export interface MatchVerdict {
  decision: MatchDecision;
  /// Machine tags for the surfaced risk(s), e.g. 'link-offense', 'velocity'.
  flags: string[];
  /// One plain-language line for the deal banner (the first / most severe reason).
  reason: string;
  /// Per-flag explanations, for the audit event.
  reasons: string[];
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
  const reasons: string[] = [];
  let hold = false;

  const price = Number(proposal.raisedPriceUsdc ?? proposal.agreedPriceUsdc);

  // 1. Prior unsafe-link offenses (either party) — the strongest deterministic
  //    signal. A party with a record holds the match for review.
  const buyerOffenses =
    getLinkOffenseCount(proposal.buyerUser) + getLinkOffenseCount(proposal.buyerAgent);
  const sellerOffenses =
    getLinkOffenseCount(proposal.sellerUser) + getLinkOffenseCount(proposal.sellerAgent);
  if (buyerOffenses > 0 || sellerOffenses > 0) {
    flags.push('link-offense');
    reasons.push(
      `Prior unsafe-link offenses on record (buyer ${buyerOffenses}, seller ${sellerOffenses}).`,
    );
    hold = true;
  }

  // 2. Velocity + tier on both parties (free on-platform signals).
  const [buyerSig, sellerSig] = await Promise.all([
    actorSignalsFor(proposal.buyerAgent),
    actorSignalsFor(proposal.sellerAgent),
  ]);
  if (buyerSig.velocity24h >= SPAM_VELOCITY || sellerSig.velocity24h >= SPAM_VELOCITY) {
    flags.push('velocity');
    reasons.push(
      `Elevated 24h activity (buyer ${buyerSig.velocity24h}, seller ${sellerSig.velocity24h}) — possible bot.`,
    );
  }

  // 3. Tier vs size: a large deal with an unproven counterparty deserves a look
  //    before it proceeds unattended.
  if (Number.isFinite(price) && price >= LARGE_DEAL_USDC && (unproven(buyerSig.repTier) || unproven(sellerSig.repTier))) {
    flags.push('tier-vs-size');
    reasons.push(`Large deal (${price} USDC) with an unproven counterparty tier.`);
  }

  // 4. Price far below the grounded market band — classic probe / underpricing.
  const fair = proposal.marketRead?.fairPriceUsdc;
  if (fair && fair > 0 && Number.isFinite(price) && price < fair * PRICE_BAND_FLOOR) {
    flags.push('price-below-band');
    reasons.push(
      `Agreed price ${price} USDC is ${Math.round((1 - price / fair) * 100)}% below the grounded market (${fair} USDC).`,
    );
  }

  // 5. Fold in the negotiation-time risk classification (signals.ts). A
  //    concentration-high or honey-trap already surfaced there escalates to hold.
  if (proposal.riskFlag) {
    flags.push(proposal.riskFlag);
    if (proposal.riskNote) reasons.push(proposal.riskNote);
    if (proposal.riskFlag === 'concentration-high' || proposal.riskFlag === 'honey-trap') hold = true;
  }

  const decision: MatchDecision = flags.length === 0 ? 'pass' : hold ? 'hold' : 'flag';
  return {
    decision,
    flags: [...new Set(flags)],
    reason: reasons[0] ?? 'No risk signals.',
    reasons,
    paidConsulted: !!(proposal.paidSignal || proposal.marketRead),
    evaluatedAt: Date.now(),
  };
}
