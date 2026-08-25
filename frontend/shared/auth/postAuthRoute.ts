export type AuthEntryIntent = 'new' | 'returning';

interface PostAuthRouteInput {
  intent: AuthEntryIntent;
  profileExists: boolean;
  requestedHref: string | null;
}

/**
 * Choose the first authenticated destination without trusting the button the
 * visitor picked as proof of account state. The backend profile is the source
 * of truth: profile-less identities onboard, existing profiles continue.
 */
export function postAuthDestination({
  intent: _intent,
  profileExists,
  requestedHref,
}: PostAuthRouteInput): string | null {
  if (requestedHref === null) return null;
  if (!profileExists) return '/onboarding';
  return requestedHref;
}
