import type { RepTier } from '../agents/signals.js';
import { logger } from '../logger.js';

/// Collateral policy for purchase-order financing.
///
/// This is a SUGGESTION, not a gate. The financier sees the number prefilled and
/// may raise it; the only hard floor is `minStakeBps` on KarwanPOFinancing, which
/// the operator sets on chain. Keeping the tier rule here rather than in the
/// contract is deliberate: tier policy changes far more often than a money
/// contract should be redeployed, and reading a v2 reputation composite on chain
/// would mean redeploying KarwanReputation and cascading through everything that
/// references it.
///
/// PO financing is riskier than factoring for the financier. Factoring advances
/// against goods already delivered; a PO advance goes out before the seller has
/// shipped anything, and it lands in the seller's wallet immediately. So these
/// numbers sit above the factoring ladder at every tier below elite.
///
/// Every figure is env-tunable so the desk can be re-rated without a deploy. A
/// malformed value NEVER silently lowers a requirement: it logs and falls back to
/// the built-in default. Failing open on a collateral policy would be the one
/// direction that costs a financier money, and an env typo is exactly the kind of
/// thing nobody notices until a line defaults.

/// Parse a whole number from the environment, refusing anything that is not one.
/// Out-of-range and unparseable values both fall back rather than clamping
/// silently, so an operator who fat-fingers a value sees it in the logs instead
/// of discovering it in a default.
function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const n = Number(raw.trim());
  if (!Number.isInteger(n)) {
    logger.error(
      { env: name, value: raw, using: fallback },
      'po stake policy: value is not a whole number; falling back to the default',
    );
    return fallback;
  }
  if (n < min || n > max) {
    logger.error(
      { env: name, value: n, min, max, using: fallback },
      'po stake policy: value is out of range; falling back to the default',
    );
    return fallback;
  }
  return n;
}

/// Stake suggested to back a PO advance, as basis points of the principal, by
/// the seller's reputation tier. A proven elite is waived, a new wallet fully
/// collateralizes. Reputation buys the collateral down: stake is the skin in the
/// game a thin track record has not yet earned.
///
/// Env: PO_STAKE_BPS_ELITE, _STRONG, _ESTABLISHED, _COLD, _NEW.
export const PO_STAKE_BPS: Record<RepTier, number> = {
  elite: envInt('PO_STAKE_BPS_ELITE', 0, 0, 10_000),
  strong: envInt('PO_STAKE_BPS_STRONG', 500, 0, 10_000),
  established: envInt('PO_STAKE_BPS_ESTABLISHED', 1_000, 0, 10_000),
  cold: envInt('PO_STAKE_BPS_COLD', 1_500, 0, 10_000),
  new: envInt('PO_STAKE_BPS_NEW', 2_000, 0, 10_000),
};

/// Above this principal, size alone asks for collateral regardless of tier. A
/// spotless record earned on small deals is not evidence about a large one, and
/// the financier's whole advance is exposed from the moment they fund.
///
/// Env: PO_LARGE_ADVANCE_USDC.
export const LARGE_ADVANCE_USDC = envInt('PO_LARGE_ADVANCE_USDC', 5_000, 0, 100_000_000);

/// The floor applied once an advance is "large".
///
/// NOTE this floor (25%) sits ABOVE every tier rate, including `new` at 20%. So
/// past LARGE_ADVANCE_USDC the ladder stops mattering and every seller posts the
/// same 25%, elite included. That is a deliberate shape, not an oversight:
/// reputation grades the small deals, size governs the large ones. If you want
/// tier to keep separating sellers on big advances, set this below
/// PO_STAKE_BPS_NEW.
///
/// Env: PO_LARGE_ADVANCE_FLOOR_BPS.
export const LARGE_ADVANCE_FLOOR_BPS = envInt('PO_LARGE_ADVANCE_FLOOR_BPS', 2_500, 0, 10_000);

/// Every PO advance must carry meaningful seller protection regardless of
/// reputation tier. Reputation may raise the requirement, but never reduce it
/// below 60% of the financier's principal exposure.
export const PO_MIN_PROTECTION_BPS = envInt('PO_MIN_PROTECTION_BPS', 6_000, 6_000, 10_000);

export interface POStakeSuggestion {
  tier: RepTier;
  /// Basis points of principal, after the large-advance floor is applied.
  suggestedBps: number;
  /// The same figure in USDC, as a decimal string.
  suggestedStakeUsdc: string;
  /// True when the large-advance floor raised the tier's own rate.
  raisedBySize: boolean;
}

/// The suggested collateral for one advance. Rounds UP to the cent so the
/// suggestion never lands a hair under the intended share of principal.
export function suggestPOStake(tier: RepTier, principalUsdc: number): POStakeSuggestion {
  const tierBps = PO_STAKE_BPS[tier];
  const sizeBps = principalUsdc > LARGE_ADVANCE_USDC ? LARGE_ADVANCE_FLOOR_BPS : 0;
  const suggestedBps = Math.max(PO_MIN_PROTECTION_BPS, tierBps, sizeBps);

  const raw = (principalUsdc * suggestedBps) / 10_000;
  const suggested = Math.ceil(raw * 100) / 100;

  return {
    tier,
    suggestedBps,
    suggestedStakeUsdc: suggested.toFixed(2),
    raisedBySize: sizeBps > tierBps,
  };
}

/// One-line summary for the ops diagnostics page, so an operator can see what
/// the desk is actually enforcing without reading the env by hand.
export function describePOStakePolicy(): string {
  const ladder = (Object.keys(PO_STAKE_BPS) as RepTier[])
    .map((t) => `${t}=${PO_STAKE_BPS[t] / 100}%`)
    .join(' ');
  return `${ladder} | minimum=${PO_MIN_PROTECTION_BPS / 100}% | >${LARGE_ADVANCE_USDC} USDC floors at ${LARGE_ADVANCE_FLOOR_BPS / 100}%`;
}
