'use client';
import { SettingsBand } from '@/features/settings/components/SettingsBand';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';

export default function SettingsPage() {
  const t = useTranslations();

  return (
    <AuthGuard gateTag={t.profile.signInGate.tag} gateBody={t.profile.signInGate.body}>
      <ProfileFrame title={t.settings.title}>
        <SettingsBand />
      </ProfileFrame>
    </AuthGuard>
  );
}
