export type OnboardingStep =
  | 'language'
  | 'accountType'
  | 'connect'
  | 'role'
  | 'profile'
  | 'getReady';

export type OnboardingAccountKind = 'person' | 'business' | null;

/**
 * A business operates on both sides of trade, so it does not need the
 * individual role picker. Keeping this as a pure model prevents rendered
 * progress, browser Back handling, and automatic sign-in transitions from
 * drifting into three different versions of the journey.
 */
export function onboardingJourney(
  accountKind: OnboardingAccountKind,
): readonly OnboardingStep[] {
  if (accountKind === 'business') {
    return ['language', 'accountType', 'connect', 'profile', 'getReady'];
  }

  return ['language', 'accountType', 'connect', 'role', 'profile', 'getReady'];
}

export function onboardingProgress(
  step: OnboardingStep,
  accountKind: OnboardingAccountKind,
): { current: number; total: number } {
  const journey = onboardingJourney(accountKind);
  const index = journey.indexOf(step);
  return {
    current: index >= 0 ? index + 1 : 1,
    total: journey.length,
  };
}

export function stepAfterAuthentication(
  accountKind: OnboardingAccountKind,
): 'role' | 'profile' {
  return accountKind === 'business' ? 'profile' : 'role';
}
