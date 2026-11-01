'use client';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { yourAgentCopy } from '@/shared/i18n/messages/yourAgent';
import { TierCelebration } from '@/features/reputation/components/TierCelebration';
import { ProfileFrame } from '@/features/profile/ui/ProfileUi';
import { ReputationSources } from '@/features/profile/ui/ReputationSources';

/// Where the person's record is read from, moved off the Your agent page (view 45).
export default function RecordSourcesPage() {
  const t = useTranslations().profile;
  const { locale } = useLocale();
  const { address } = useUserProfile();
  const title = (yourAgentCopy[locale as keyof typeof yourAgentCopy] ?? yourAgentCopy.en).recordSources;
  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <ProfileFrame title={title} backHref="/profile">
        {address ? <TierCelebration address={address} /> : null}
        {address ? <ReputationSources address={address} /> : null}
      </ProfileFrame>
    </AuthGuard>
  );
}
