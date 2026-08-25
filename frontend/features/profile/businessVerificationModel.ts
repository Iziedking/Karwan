export type BusinessVerificationStatus = 'none' | 'submitted' | 'verified' | 'rejected';

export type BusinessProfileMinimum = {
  companyName?: string | null;
  sector?: string | null;
  region?: string | null;
};

export type BusinessVerificationStep = 'profile' | 'evidence' | 'review' | 'complete';

export function hasRequiredBusinessProfile(profile: BusinessProfileMinimum | null | undefined) {
  return Boolean(
    profile?.companyName?.trim() && profile?.sector?.trim() && profile?.region?.trim(),
  );
}

export function getBusinessVerificationStep(
  status: BusinessVerificationStatus,
  profile: BusinessProfileMinimum | null | undefined,
): BusinessVerificationStep {
  if (status === 'verified') return 'complete';
  if (status === 'submitted') return 'review';
  return hasRequiredBusinessProfile(profile) ? 'evidence' : 'profile';
}

export function getBusinessVerificationProgress(step: BusinessVerificationStep) {
  if (step === 'profile') return 1;
  if (step === 'evidence') return 2;
  return 3;
}
