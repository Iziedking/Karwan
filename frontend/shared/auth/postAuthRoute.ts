export type AuthEntryIntent = 'new' | 'returning' | 'neutral';

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
 * authoritative: explicit legacy intents still explain a mismatch, while the
 * neutral entry used by the unified sign-in sheet lets the backend decide
 * whether this is a new account or an existing one.
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
