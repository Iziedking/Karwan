'use client';
import { SettingsBand } from '@/features/settings/components/SettingsBand';
import { PageTour } from '@/shared/guide/PageTour';
import { SETTINGS_TOUR_ID, SETTINGS_STEPS } from '@/shared/guide/tours';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';

export default function SettingsPage() {
  const t = useTranslations();

  return (
    <AuthGuard gateTag={t.profile.signInGate.tag} gateBody={t.profile.signInGate.body}>
      <ProfileFrame title={t.settings.title}>
        <PageTour id={SETTINGS_TOUR_ID} steps={SETTINGS_STEPS} />
        <SettingsBand />
      </ProfileFrame>
    </AuthGuard>
  );
}
