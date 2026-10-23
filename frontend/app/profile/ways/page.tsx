'use client';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WaysEditor } from '@/features/profile/WaysEditor';

/// How the person's agents deal (view 26): one way per kind of deal, for
/// selling and for buying. Only the caller's own profile is read or saved.
export default function ProfileWaysPage() {
  const t = useTranslations().profile;
  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <WaysEditor />
    </AuthGuard>
  );
}
