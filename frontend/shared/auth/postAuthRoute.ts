export type AuthEntryIntent = 'new' | 'returning';

interface PostAuthRouteInput {
  intent: AuthEntryIntent;
  accountExists: boolean;
  profileExists: boolean;
  requestedHref: string | null;
}

export type AuthEntryOutcome =
  | { kind: 'continue'; destination: string | null }
  | { kind: 'needs-create' }
  | { kind: 'needs-sign-in' };

/**
 * Resolve the authenticated entry intent without trusting the button the
 * visitor picked as proof of account state. Account and profile records are
 * authoritative: mismatched intent is explained, while incomplete profiles
 * resume onboarding instead of creating a duplicate identity.
 */
export function postAuthDestination({
  intent,
  accountExists,
  profileExists,
  requestedHref,
}: PostAuthRouteInput): AuthEntryOutcome {
  if (intent === 'new' && accountExists) return { kind: 'needs-sign-in' };
  if (intent === 'returning' && !accountExists) return { kind: 'needs-create' };
  if (requestedHref === null) return { kind: 'continue', destination: null };
  if (!profileExists) return { kind: 'continue', destination: '/onboarding' };
  return { kind: 'continue', destination: requestedHref };
}
