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

/// What a stranger may see of someone's skill verifications.
///
/// The public profile projection dropped `skillVerifications` wholesale, so a
/// credit passport, which is the page a counterparty or a financier actually
/// reads, could say nothing about what the person is verified to do. It carried
/// deal history and stake and no capability at all.
///
/// This is the same line the business envelope already draws: the STATUS is
/// public, the evidence behind it is not. So a credential reduces to the skill
/// and when it was verified. Deliberately dropped:
///
///   issuer, evidenceType, commitment   the evidence trail. A commitment is a
///                                      hash of something the holder submitted
///                                      privately; publishing it invites
///                                      correlation against whatever produced it.
///   reasonCode, message                why a verification failed. Nobody's
///                                      business but the holder's.
///
/// And only CURRENTLY verified records survive. A pending record says "this
/// person is being assessed and may fail", a rejected or revoked one is a
/// negative judgement, and an expired one is a credential that has lapsed. None
/// of those is "verified", and a passport that showed them would be publishing
/// a judgement the holder never agreed to share.
export interface PublicSkillCredential {
  skillId: string;
  verifiedAt: number;
  /// Present when the credential lapses. A reader deciding whether to trust it
  /// deserves to know it has an end date.
  expiresAt?: number;
}

export function publicSkillCredentials(
  records:
    | Array<{
        skillId: string;
        status: 'pending' | 'verified' | 'rejected' | 'expired' | 'revoked';
        verifiedAt?: number;
        expiresAt?: number;
      }>
    | undefined,
  now = Date.now(),
): PublicSkillCredential[] {
  if (!records?.length) return [];
  const bySkill = new Map<string, PublicSkillCredential>();
  for (const record of records) {
    if (record.status !== 'verified') continue;
    if (record.expiresAt !== undefined && record.expiresAt <= now) continue;
    const verifiedAt = record.verifiedAt;
    // A verified record with no timestamp cannot be dated, and an undated
    // credential on a public page is worse than no credential.
    if (typeof verifiedAt !== 'number') continue;
    const existing = bySkill.get(record.skillId);
    // One entry per skill. Re-verification writes a new record rather than
    // replacing the old one, and the passport should show the current
    // credential, not the history of it.
    if (existing && existing.verifiedAt >= verifiedAt) continue;
    bySkill.set(record.skillId, {
      skillId: record.skillId,
      verifiedAt,
      ...(record.expiresAt !== undefined ? { expiresAt: record.expiresAt } : {}),
    });
  }
  return [...bySkill.values()].sort((a, b) => b.verifiedAt - a.verifiedAt);
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
  // Asking about a SPECIFIC skill picks that record. Asking about the account
  // in general ("is this person verified at all") has to prefer a currently
  // verified record: `find` returned whichever was written first, so an account
  // holding one rejected skill and three verified ones reported REJECTED and
  // lost agent matching and reputation with it.
  const candidates = skillId === undefined ? (records ?? []) : (records ?? []).filter((item) => item.skillId === skillId);
  const record =
    candidates.find(
      (item) =>
        item.status === 'verified' && (item.expiresAt === undefined || item.expiresAt > now),
    ) ?? candidates[0];
  if (!record) return { status: 'unverified' } as const;
  if (record.status === 'verified' && record.expiresAt !== undefined && record.expiresAt <= now) {
    return { status: 'expired', expiredAt: record.expiresAt } as const;
  }
  if (record.status === 'pending') return { status: 'pending', submittedAt: record.submittedAt ?? now } as const;
  if (record.status === 'verified') return { status: 'verified', verifiedAt: record.verifiedAt ?? now, ...(record.expiresAt !== undefined ? { expiresAt: record.expiresAt } : {}) } as const;
  if (record.status === 'revoked') return { status: 'revoked', revokedAt: now, reasonCode: record.reasonCode ?? 'revoked' } as const;
  return { status: 'rejected', reasonCode: record.reasonCode ?? 'rejected', message: record.message ?? 'Verification was rejected.' } as const;
}