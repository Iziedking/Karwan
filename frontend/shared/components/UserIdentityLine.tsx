'use client';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { shortAddress } from '@/shared/utils/format';

/// The identity line under a dashboard heading. Resolves the display name from
/// the connected user's own profile, not from the backend agent config.
export function UserIdentityLine() {
  const { profile, address, isConnected } = useUserProfile();

  if (!isConnected || !address) {
    return (
      <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">Wallet not connected</p>
    );
  }

  return (
    <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">
      {shortAddress(address)}
      {profile?.displayName ? ` · ${profile.displayName}` : ''}
    </p>
  );
}
