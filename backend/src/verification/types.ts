export type AccountKind = 'individual' | 'business';

export type VerificationState =
  | { status: 'unverified' }
  | { status: 'pending'; submittedAt: number }
  | { status: 'verified'; verifiedAt: number; expiresAt?: number }
  | { status: 'rejected'; reasonCode: string; message: string }
  | { status: 'expired'; expiredAt: number }
  | { status: 'revoked'; revokedAt: number; reasonCode: string };

export type EligibilityDecision = {
  directDeals: true;
  agentMatching: boolean;
  reputationEligible: boolean;
  businessPerks: boolean;
  reputationEligibleFrom?: number;
  reasons: string[];
  policyVersion: string;
};

export type PolicyFlags = {
  skillVerificationEnforced: boolean;
  businessVerificationEnforced: boolean;
  verifiedReputationEnforced: boolean;
  verifiedAgentMatchingEnforced: boolean;
  unverifiedBusinessPerksEnforced: boolean;
};

export type EligibilityInput = {
  accountKind: AccountKind;
  verification: VerificationState;
  flags: PolicyFlags;
  policyVersion: string;
};