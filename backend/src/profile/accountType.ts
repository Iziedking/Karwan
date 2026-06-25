import { getProfile, type UserProfile } from '../db/profiles.js';

export type AccountType = 'person' | 'business';
export type TradeLane = 'service' | 'finance';

/// Resolve a wallet's account type, defaulting to 'person' when the profile
/// is absent or unset. Business is conferred only by the registry approval
/// listener, so this read is the authoritative gate for finance-lane access.
export async function accountTypeOf(address: string): Promise<AccountType> {
  const profile = await getProfile(address);
  return profile?.accountType === 'business' ? 'business' : 'person';
}

export function isVerifiedBusiness(
  profile: Pick<UserProfile, 'accountType'> | null | undefined,
): boolean {
  return profile?.accountType === 'business';
}

/// Which rail a wallet belongs to. Business accounts live in the SME rail,
/// individuals in P2P; the two never cross. Driven by the onboarding choice
/// (`accountKind`), with a legacy fallback for profiles created before that
/// field existed (a verified business type, or a registration envelope past
/// 'none'). This is the authoritative backend predicate, mirrored on the
/// frontend by `isBusinessAccount`. Distinct from `accountTypeOf`, which is the
/// verification gate; a business that onboarded but is not yet verified still
/// belongs to the SME rail so it can register and operate there.
export async function accountKindOf(address: string): Promise<AccountType> {
  const profile = await getProfile(address);
  if (profile?.accountKind === 'business') return 'business';
  if (profile?.accountType === 'business') return 'business';
  if (profile?.business && profile.business.status !== 'none') return 'business';
  return 'person';
}

/// Derive the match lane for a new brief, listing, or deal. The finance lane
/// requires a verified-business initiator AND a trade-finance nature (goods or
/// mixed). A business buying a single service stays in the service lane so it
/// still reaches person providers. Everything a person posts stays 'service',
/// which leaves the entire existing P2P flow unchanged.
export function deriveLane(
  accountType: AccountType,
  tradeType: 'service' | 'goods' | 'mixed' | undefined,
): TradeLane {
  if (accountType !== 'business') return 'service';
  return tradeType === 'goods' || tradeType === 'mixed' ? 'finance' : 'service';
}
