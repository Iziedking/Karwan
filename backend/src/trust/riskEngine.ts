/// The trust engine's rules. Facts about each party and the deal go in; one
/// decision comes out: who must verify with World ID and why, whether the
/// seller must hold stake, how delivery is checked, and a level for the deal.
///
/// Plain rules, no model. Every decision carries its reason codes and the rules
/// version, so a stored decision can always be explained and replayed. Nothing
/// here declines a deal or touches money; the strongest outcome is a step-up.

export const TRUST_RULES_VERSION = 'trust-v1';

export const TRUST_LIMITS = {
  /// At or above this amount both sides verify, whatever their history.
  largeDealUsdc: 1000,
  /// A new account opening this many deals inside a day is asked again.
  fastDeals: 5,
  fastWindowMs: 24 * 3_600_000,
  newAccountDays: 7,
  /// Lost disputes before a seller must hold stake on new deals.
  lostDisputesForStake: 2,
  /// The smallest stake share a deal accepts.
  stakePct: 50,
  /// How far from the recent median a price must sit to be noted.
  offMarketZ: 3,
} as const;

export type Role = 'buyer' | 'seller';
export type TrustLevel = 'clear' | 'watch' | 'step_up';
export type TrustReason =
  | 'first_deal'
  | 'large_deal'
  | 'fast_new_account'
  | 'flagged_link_before'
  | 'lost_disputes'
  | 'off_market_price'
  | 'below_market_price';

export interface PartyFacts {
  settledDeals: number;
  /// Passed World ID on an earlier Karwan deal.
  worldIdPassed: boolean;
  lostDisputes: number;
  dealsLastDay: number;
  /// Null when the account has no profile yet (an invited seller).
  accountAgeDays: number | null;
  linkOffenses: number;
}

export interface DealFacts {
  amountUsdc: number;
  /// Robust z-score of the price against recent deals; null with too little history.
  priceZ: number | null;
  /// The agreement names a GitHub repository, pull request or commit.
  githubDelivery: boolean;
}

export interface TrustDecision {
  version: string;
  level: TrustLevel;
  /// Who verifies with World ID on this deal, and the first reason for each.
  verify: Partial<Record<Role, TrustReason>>;
  stakeRequired: boolean;
  delivery: 'github' | 'plain';
  reasons: Array<{ code: TrustReason; role?: Role }>;
  decidedAt: number;
}

export interface TrustInput {
  buyer: PartyFacts;
  /// Null while the seller is invited by email and not yet known.
  seller: PartyFacts | null;
  deal: DealFacts;
  /// World ID can only be asked for where it is configured.
  worldIdAvailable: boolean;
  now?: number;
}

function partyReasons(facts: PartyFacts): TrustReason[] {
  const out: TrustReason[] = [];
  if (facts.settledDeals === 0 && !facts.worldIdPassed) out.push('first_deal');
  const isNew = facts.accountAgeDays !== null && facts.accountAgeDays < TRUST_LIMITS.newAccountDays;
  if (isNew && facts.dealsLastDay >= TRUST_LIMITS.fastDeals) out.push('fast_new_account');
  if (facts.linkOffenses > 0) out.push('flagged_link_before');
  return out;
}

export function decideTrust(input: TrustInput): TrustDecision {
  const reasons: TrustDecision['reasons'] = [];
  const verify: TrustDecision['verify'] = {};
  const large = input.deal.amountUsdc >= TRUST_LIMITS.largeDealUsdc;

  for (const role of ['buyer', 'seller'] as const) {
    const facts = input[role];
    if (!facts) continue;
    const own = partyReasons(facts);
    for (const code of own) reasons.push({ code, role });
    const first = own[0] ?? (large ? 'large_deal' : undefined);
    if (first && input.worldIdAvailable) verify[role] = first;
  }
  if (large) reasons.push({ code: 'large_deal' });

  const stakeRequired = (input.seller?.lostDisputes ?? 0) >= TRUST_LIMITS.lostDisputesForStake;
  if (stakeRequired) reasons.push({ code: 'lost_disputes', role: 'seller' });

  const z = input.deal.priceZ;
  const offMarket = z !== null && Math.abs(z) >= TRUST_LIMITS.offMarketZ;
  // Above and below are told apart: a cheap price and an inflated one call for different words.
  if (offMarket) reasons.push({ code: (z as number) > 0 ? 'off_market_price' : 'below_market_price' });

  const level: TrustLevel =
    Object.keys(verify).length > 0 || stakeRequired ? 'step_up' : offMarket || reasons.length > 0 ? 'watch' : 'clear';

  return {
    version: TRUST_RULES_VERSION,
    level,
    verify,
    stakeRequired,
    delivery: input.deal.githubDelivery ? 'github' : 'plain',
    reasons,
    decidedAt: input.now ?? Date.now(),
  };
}

/// The World ID subject the deal's existing gate understands.
export function verifySubject(decision: Pick<TrustDecision, 'verify'>): 'buyer' | 'seller' | 'both' | null {
  const buyer = !!decision.verify.buyer;
  const seller = !!decision.verify.seller;
  return buyer && seller ? 'both' : buyer ? 'buyer' : seller ? 'seller' : null;
}

/// Merge two subjects so a later decision can add a party but never drop one
/// that an earlier decision or the buyer already asked for.
export function unionSubject(
  a: 'buyer' | 'seller' | 'both' | null | undefined,
  b: 'buyer' | 'seller' | 'both' | null | undefined,
): 'buyer' | 'seller' | 'both' | null {
  const has = (role: Role) => a === role || a === 'both' || b === role || b === 'both';
  return has('buyer') && has('seller') ? 'both' : has('buyer') ? 'buyer' : has('seller') ? 'seller' : null;
}

const GITHUB_URL = /github\.com\/[\w.-]+\/[\w.-]+/i;
const GITHUB_WORD = /\bgithub\b/i;
const CODE_DELIVERY = /\b(repo|repository|pull request|pr|commit|branch|merge)\b/i;

/// The agreement asks for delivery on GitHub: a repository link, or GitHub
/// named together with a repository, pull request or commit.
export function mentionsGithubDelivery(text: string): boolean {
  return GITHUB_URL.test(text) || (GITHUB_WORD.test(text) && CODE_DELIVERY.test(text));
}

/// What one party may read of a decision. Their own reasons and the deal-wide
/// ones are shown; the other person's are reduced to the fact that they verify,
/// because a reason like a flagged link is theirs to see, not their
/// counterparty's.
export interface TrustView {
  verify: Partial<Record<Role, TrustReason | 'check'>>;
  stakeRequired: boolean;
  delivery: 'github' | 'plain';
  reasons: TrustReason[];
}

const SHARED: ReadonlySet<TrustReason> = new Set(['first_deal', 'large_deal']);

export function trustForViewer(decision: TrustDecision, viewer: Role): TrustView {
  const verify: TrustView['verify'] = {};
  for (const role of ['buyer', 'seller'] as const) {
    const reason = decision.verify[role];
    if (reason) verify[role] = role === viewer || SHARED.has(reason) ? reason : 'check';
  }
  const reasons = decision.reasons
    .filter((r) => r.role === undefined || r.role === viewer)
    .map((r) => r.code);
  return { verify, stakeRequired: decision.stakeRequired, delivery: decision.delivery, reasons: [...new Set(reasons)] };
}
