'use client';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { shortAddress } from '@/shared/utils/format';

/// The identity line under a dashboard heading. Resolves the display name from
/// the connected user's own profile, not from the backend agent config.
export function UserIdentityLine() {
  const { profile, address, isConnected } = useUserProfile();
  const t = useTranslations().inlineControls;

  if (!isConnected || !address) {
    return (
      <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">{t.walletNotConnected}</p>
    );
  }

  return (
    <p className="text-[12px] mono text-[var(--color-ink-faint)] mt-1">
      {shortAddress(address)}
      {profile?.displayName ? ` · ${profile.displayName}` : ''}
    </p>
  );
}
