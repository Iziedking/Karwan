import type { UserProfile } from '@/core/api';
import { isBusinessAccount } from '@/features/account/accountKind';

/** Build only the fields accepted by the profile endpoint. Never expand roles
 * or replace saved trading limits as a side effect of business setup. */
export function businessSetupInput(profile: UserProfile, name: string, confirmed: boolean) {
  const displayName = name.trim();
  if (!displayName || displayName.length > 40) throw new Error('invalid_name');
  if (!isBusinessAccount(profile) && !confirmed) throw new Error('confirmation_required');
  return {
    address: profile.address,
    role: profile.role,
    displayName,
    accountKind: 'business' as const,
    ...(profile.buyer ? { buyer: { ...profile.buyer } } : {}),
    ...(profile.seller ? { seller: { ...profile.seller } } : {}),
  };
}
