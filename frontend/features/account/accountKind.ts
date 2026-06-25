import type { UserProfile } from '@/core/api';

/// The single person/business predicate for the whole frontend. Business
/// accounts live entirely in the SME rail; individuals live entirely in P2P.
/// The decision is made here so nav, route guards, the home, and tours all
/// agree.
///
/// Primary signal is the onboarding choice (`accountKind`). The fallbacks cover
/// legacy profiles created before `accountKind` existed: a verified business
/// type, or a registration envelope that is past 'none'. We deliberately do NOT
/// infer business from `smeProfile` presence alone, to avoid false positives.
export function isBusinessAccount(
  profile?:
    | Pick<UserProfile, 'accountKind' | 'accountType' | 'business'>
    | null,
): boolean {
  if (!profile) return false;
  if (profile.accountKind === 'business') return true;
  if (profile.accountType === 'business') return true;
  if (profile.business && profile.business.status !== 'none') return true;
  return false;
}
