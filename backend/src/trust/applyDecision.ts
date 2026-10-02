/// Turns a trust decision into the deal fields the existing gates already
/// enforce: the World ID subject, the delivery check and the seller's stake.
/// It only ever adds protection. A party already asked to verify, a check the
/// buyer already turned on, or a larger stake share all survive.

import type { DirectDeal } from '../db/deals.js';
import {
  createHighSignalVerification,
  requiresHighSignal,
  type HighSignalVerification,
} from '../deals/highSignalVerification.js';
import { TRUST_LIMITS, unionSubject, verifySubject, type TrustDecision } from './riskEngine.js';

type Protected = Pick<
  DirectDeal,
  'verificationPolicy' | 'verificationSubject' | 'highSignalVerification' | 'evidenceRequired' | 'requireStake' | 'requireStakePct'
>;

export function trustPatch(current: Protected, decision: TrustDecision): Partial<DirectDeal> {
  const patch: Partial<DirectDeal> = { trust: decision };
  const existing = current.verificationPolicy === 'high_signal' ? current.verificationSubject ?? 'seller' : null;
  const subject = unionSubject(existing, verifySubject(decision));
  if (subject && subject !== existing) {
    const fresh = createHighSignalVerification(subject);
    const before = current.highSignalVerification;
    const merged: HighSignalVerification = {
      ...fresh,
      buyer: requiresHighSignal(subject, 'buyer') ? before?.buyer ?? fresh.buyer : undefined,
      seller: requiresHighSignal(subject, 'seller') ? before?.seller ?? fresh.seller : undefined,
    };
    patch.verificationPolicy = 'high_signal';
    patch.verificationSubject = subject;
    patch.highSignalVerification = merged;
  }
  if (decision.delivery === 'github' && !current.evidenceRequired) patch.evidenceRequired = true;
  if (decision.stakeRequired) {
    patch.requireStake = true;
    patch.requireStakePct = Math.max(current.requireStake ? current.requireStakePct ?? 0 : 0, TRUST_LIMITS.stakePct);
  }
  return patch;
}
