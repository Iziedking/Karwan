import type { UserProfile } from '@/core/api';

/// Legacy profile-level fallback for older routes that have not yet received
/// the selected workspace context. New navigation, home, and route guards use
/// the workspace provider so one identity can move between personal and
/// business workspaces without creating a second account.
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
