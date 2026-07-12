import { formatUnits } from 'viem';
import { getProfile, type UserProfile } from '../db/profiles.js';
import type { DirectDeal } from '../db/deals.js';
import { loadInputs } from '../reputation/signals.js';
import { compute } from '../reputation/engine.js';
import { TIER_BREAKPOINTS } from '../reputation/config.js';
import { vault } from '../chain/contracts.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Financier eligibility + access. Anyone can apply (from the SME rail) to fund
/// factoring and PO-financing lines, but only once they clear a real bar:
/// minimum account tenure on Karwan, a non-zero stake (skin in the game), and a
/// reputation at least COLD. This replaces the old implicit model where anyone
/// who posted an offer was a financier. The check reuses the same primitives the
/// rest of the platform trusts (the reputation engine, the vault stake read).

export type FinancierStatus = 'none' | 'applied' | 'approved' | 'rejected';

const MS_PER_DAY = 86_400_000;

/// Fields a financier browsing the desk has no business seeing. Circle agent
/// wallet IDs are infrastructure identifiers; marketRead and passportPulls are
/// the two parties' paid, private intelligence on each other. The desk needs the
/// deal's commercial shape (amount, terms, counterparty, tier), not these.
const FINANCIER_HIDDEN_FIELDS = [
  'buyerAgentWalletId',
  'sellerAgentWalletId',
  'marketRead',
  'passportPulls',
] as const;

/// Project a deal down to what a financier may see on the desk. A denylist, not
/// an allowlist, so a newly added deal field is not silently exposed only if we
/// remember to add it: any new field defaults to visible, and anything sensitive
/// must be named here. Keep this list in step with the deal shape.
export function financierSafeDeal(deal: DirectDeal): Omit<DirectDeal, (typeof FINANCIER_HIDDEN_FIELDS)[number]> {
  const out = { ...deal };
  for (const f of FINANCIER_HIDDEN_FIELDS) delete out[f];
  return out;
}

/// Whether this profile may post factoring offers / fund PO lines right now.
export function isApprovedFinancier(
  profile: Pick<UserProfile, 'financier'> | null | undefined,
): boolean {
  return profile?.financier?.status === 'approved';
}

export interface FinancierEligibility {
  eligible: boolean;
  tenureDays: number;
  tenureOk: boolean;
  stakeUsdc: number;
  stakeOk: boolean;
  /// null when the on-chain stake read failed (treated as not-ok, never as a
  /// silent pass).
  stakeRead: boolean;
  repScore: number;
  repTier: string;
  repOk: boolean;
  /// Human-readable list of what is still missing, for the apply UI.
  reasons: string[];
}

/// Compute the live eligibility breakdown for an address. Best-effort on each
/// signal: a failed read fails that check (never passes it), so the gate is
/// fail-closed. Tenure comes from the profile's createdAt (the canonical signup
/// time), stake from the vault, reputation from the engine.
export async function financierEligibility(address: string): Promise<FinancierEligibility> {
  const addr = address.toLowerCase();
  const profile = await getProfile(addr).catch(() => null);

  // Tenure
  const createdAt = profile?.createdAt ?? Date.now();
  const tenureDays = Math.max(0, Math.floor((Date.now() - createdAt) / MS_PER_DAY));
  const tenureOk = tenureDays >= config.FINANCIER_MIN_TENURE_DAYS;

  // Stake (fail-closed on a read error)
  let stakeUsdc = 0;
  let stakeRead = false;
  try {
    const freeWei = (await vault.read.freeStakeOf([addr as `0x${string}`])) as bigint;
    stakeUsdc = Number(formatUnits(freeWei, 6));
    stakeRead = true;
  } catch (err) {
    logger.warn({ address: addr, err: (err as Error).message }, 'financier stake read failed');
  }
  const stakeOk = stakeRead && stakeUsdc > 0;

  // Reputation (>= COLD)
  let repScore = 0;
  let repTier = 'NEW';
  try {
    const result = compute(await loadInputs(addr));
    repScore = result.score;
    repTier = result.tier;
  } catch (err) {
    logger.warn({ address: addr, err: (err as Error).message }, 'financier reputation read failed');
  }
  const repOk = repScore >= TIER_BREAKPOINTS.COLD;

  const reasons: string[] = [];
  if (!tenureOk) {
    reasons.push(
      `Account must be at least ${config.FINANCIER_MIN_TENURE_DAYS} days old (currently ${tenureDays}).`,
    );
  }
  if (!stakeOk) {
    reasons.push('Stake some USDC in the vault first (skin in the game).');
  }
  if (!repOk) {
    reasons.push('Reach at least the COLD reputation tier through settled deals.');
  }

  return {
    eligible: tenureOk && stakeOk && repOk,
    tenureDays,
    tenureOk,
    stakeUsdc,
    stakeOk,
    stakeRead,
    repScore,
    repTier,
    repOk,
    reasons,
  };
}
