import { config } from '../config.js';
import type { EligibilityDecision, EligibilityInput, PolicyFlags } from './types.js';

export const policyFlags: PolicyFlags = {
  skillVerificationEnforced: config.SKILL_VERIFICATION_ENFORCED,
  businessVerificationEnforced: config.BUSINESS_VERIFICATION_ENFORCED,
  verifiedReputationEnforced: config.VERIFIED_REPUTATION_ENFORCED,
  verifiedAgentMatchingEnforced: config.VERIFIED_AGENT_MATCHING_ENFORCED,
  unverifiedBusinessPerksEnforced: config.UNVERIFIED_BUSINESS_PERKS_ENFORCED,
};

export const verificationPolicyVersion = config.VERIFICATION_POLICY_VERSION;

export function decideEligibility(input: EligibilityInput): EligibilityDecision {
  const verified = input.verification.status === 'verified';
  const verificationEnforced =
    input.accountKind === 'individual'
      ? input.flags.skillVerificationEnforced
      : input.flags.businessVerificationEnforced;
  const verificationRequired = verificationEnforced && !verified;
  const reason =
    input.accountKind === 'individual'
      ? 'skill-verification-required'
      : 'business-verification-required';

  const agentMatching =
    !(verificationRequired && input.flags.verifiedAgentMatchingEnforced);
  const reputationEligible =
    !(verificationRequired && input.flags.verifiedReputationEnforced);
  const businessPerks =
    input.accountKind === 'business' &&
    !(verificationRequired && input.flags.unverifiedBusinessPerksEnforced);
  const reasons =
    (!agentMatching || !reputationEligible || (input.accountKind === 'business' && !businessPerks))
      ? [reason]
      : [];

  return {
    directDeals: true,
    agentMatching,
    reputationEligible,
    businessPerks,
    ...(input.verification.status === 'verified' ? { reputationEligibleFrom: input.verification.verifiedAt } : {}),
    reasons,
    policyVersion: input.policyVersion,
  };
}
export function businessVerificationState(
  business: {
    status?: 'none' | 'submitted' | 'verified' | 'rejected';
    submittedAt?: number;
    verifiedAt?: number;
    expiresAt?: number;
    revokedAt?: number;
    reasonCode?: string;
    message?: string;
    rejectReason?: string;
  } | undefined,
  now = Date.now(),
) {
  if (!business || business.status === 'none') return { status: 'unverified' } as const;
  if (business.status === 'submitted') {
    return { status: 'pending', submittedAt: business.submittedAt ?? now } as const;
  }
  if (business.status === 'verified') {
    if (business.revokedAt !== undefined) {
      return { status: 'revoked', revokedAt: business.revokedAt, reasonCode: business.reasonCode ?? 'revoked' } as const;
    }
    if (business.expiresAt !== undefined && business.expiresAt <= now) {
      return { status: 'expired', expiredAt: business.expiresAt } as const;
    }
    return { status: 'verified', verifiedAt: business.verifiedAt ?? now, ...(business.expiresAt !== undefined ? { expiresAt: business.expiresAt } : {}) } as const;
  }
  return { status: 'rejected', reasonCode: business.reasonCode ?? 'rejected', message: business.message ?? business.rejectReason ?? 'Verification was rejected.' } as const;
}

export function skillVerificationState(
  records: Array<{
    skillId: string;
    status: 'pending' | 'verified' | 'rejected' | 'expired' | 'revoked';
    submittedAt?: number;
    verifiedAt?: number;
    expiresAt?: number;
    reasonCode?: string;
    message?: string;
  }> | undefined,
  skillId?: string,
  now = Date.now(),
) {
  const record = records?.find((item) => skillId === undefined || item.skillId === skillId);
  if (!record) return { status: 'unverified' } as const;
  if (record.status === 'verified' && record.expiresAt !== undefined && record.expiresAt <= now) {
    return { status: 'expired', expiredAt: record.expiresAt } as const;
  }
  if (record.status === 'pending') return { status: 'pending', submittedAt: record.submittedAt ?? now } as const;
  if (record.status === 'verified') return { status: 'verified', verifiedAt: record.verifiedAt ?? now, ...(record.expiresAt !== undefined ? { expiresAt: record.expiresAt } : {}) } as const;
  if (record.status === 'revoked') return { status: 'revoked', revokedAt: now, reasonCode: record.reasonCode ?? 'revoked' } as const;
  return { status: 'rejected', reasonCode: record.reasonCode ?? 'rejected', message: record.message ?? 'Verification was rejected.' } as const;
}