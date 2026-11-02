import { safeNext } from './safeNext';

/// Match the destination's payment model; a general sign-in makes no escrow claim.
export function signInContext(next: string | null | undefined): 'direct' | 'deal' | null {
  const safe = safeNext(next);
  if (!safe) return null;
  const path = new URL(safe, 'https://karwan.invalid').pathname;
  if (/^\/(?:deposit\/request|request|send)(?:\/|$)/.test(path)) return 'direct';
  if (/^\/(?:buyer|order|deals)(?:\/|$)/.test(path)) return 'deal';
  return null;
}
