import { decideEligibility, skillVerificationState } from './policy.js';
import type { PolicyFlags, VerificationState } from './types.js';

/// One reader for "what is this person verified in, and what does that unlock".
///
/// It exists because two different answers were already possible. The profile
/// carries `seller.skills`, which is whatever the user typed, and a separate
/// `skillVerifications` list, which is what an issuer actually attested. The
/// assistant only ever saw the first, so it would tell a seller they had five
/// skills without knowing that four were unverified and one had expired, and it
/// could not explain why their agent had stopped being matched.
///
/// A declared skill and a verified skill are deliberately kept apart here rather
/// than merged into one badge. They are different claims: one is what someone
/// says about themselves, the other is what a named issuer put their name to,
/// and collapsing them would quietly upgrade the first into the second.

export interface SkillRecord {
  skillId: string;
  status: 'pending' | 'verified' | 'rejected' | 'expired' | 'revoked';
  issuer: string;
  evidenceType: string;
  /// The zk commitment. Read here only so the type matches the store; it is
  /// never carried into the summary. It is a hash, it means nothing to a user,
  /// and internals do not belong in an answer.
  commitment?: string;
  submittedAt?: number;
  verifiedAt?: number;
  expiresAt?: number;
  reasonCode?: string;
  message?: string;
}

export interface SkillLine {
  skill: string;
  /// Normalised through the same policy the eligibility route uses, so a
  /// verification whose `expiresAt` has passed reads as expired here even
  /// though the stored record still says verified. Two surfaces disagreeing
  /// about whether someone is verified is worse than either answer.
  status: VerificationState['status'];
  /// Who attested it. Kept per skill and never merged into a single badge: a
  /// counterparty judging the claim needs to know who stood behind it.
  issuer: string | null;
  evidenceType: string | null;
  expiresAt: number | null;
  /// Present when a verification was refused or withdrawn, so the assistant can
  /// say what happened instead of only that it is not verified.
  reason: string | null;
}

export interface SkillSummary {
  accountKind: 'individual' | 'business';
  declared: string[];
  skills: SkillLine[];
  verifiedCount: number;
  /// Verifications for skills the user no longer lists on their profile. Worth
  /// surfacing: the attestation is still real and still theirs, it is simply not
  /// being used, which is a thing they can fix in one edit.
  unlistedVerified: string[];
  eligibility: ReturnType<typeof decideEligibility>;
}

export function summariseSkills(
  input: {
    accountKind: 'individual' | 'business';
    declaredSkills: string[];
    verifications: SkillRecord[] | undefined;
    /// A business account's eligibility turns on its BUSINESS verification, not
    /// on its skills. Passed in already resolved so this module has one job and
    /// the caller keeps using the same `businessVerificationState` the
    /// eligibility route does.
    businessVerification?: VerificationState;
  },
  flags: PolicyFlags,
  policyVersion: string,
  now = Date.now(),
): SkillSummary {
  const records = input.verifications ?? [];
  const byId = new Map(records.map((r) => [r.skillId.toLowerCase(), r]));

  const skills: SkillLine[] = input.declaredSkills.map((skill) => {
    const record = byId.get(skill.toLowerCase());
    const state = skillVerificationState(record ? [record] : undefined, undefined, now);
    return {
      skill,
      status: state.status,
      issuer: record?.issuer ?? null,
      evidenceType: record?.evidenceType ?? null,
      expiresAt: 'expiresAt' in state ? (state.expiresAt ?? null) : null,
      reason:
        'message' in state ? (state.message ?? null)
        : state.status === 'revoked' ? 'This verification was withdrawn by its issuer.'
        : state.status === 'expired' ? 'This verification has lapsed and needs renewing.'
        : null,
    };
  });

  const declaredLower = new Set(input.declaredSkills.map((s) => s.toLowerCase()));
  const unlistedVerified = records
    .filter(
      (r) =>
        !declaredLower.has(r.skillId.toLowerCase()) &&
        skillVerificationState([r], undefined, now).status === 'verified',
    )
    .map((r) => r.skillId);

  // Account-level eligibility answers "why is my agent not being matched", which
  // is the question a seller actually asks. It turns on ANY verification, which
  // is why it reads the whole list rather than one skill.
  const verification =
    input.accountKind === 'business'
      ? (input.businessVerification ?? { status: 'unverified' as const })
      : skillVerificationState(records, undefined, now);

  return {
    accountKind: input.accountKind,
    declared: input.declaredSkills,
    skills,
    verifiedCount: skills.filter((s) => s.status === 'verified').length,
    unlistedVerified,
    eligibility: decideEligibility({
      accountKind: input.accountKind,
      verification,
      flags,
      policyVersion,
    }),
  };
}
