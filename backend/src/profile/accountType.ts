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
