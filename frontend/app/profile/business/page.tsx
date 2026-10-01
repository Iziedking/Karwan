'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WorkspaceSwitcher } from '@/features/workspaces/components/WorkspaceSwitcher';
import { ProfileFrame, Row, RowGroup } from '@/features/profile/ui/ProfileUi';

const ACCENT_PILL =
  'inline-flex min-h-11 items-center rounded-full bg-[var(--lp-accent)] px-5 text-[14px] font-semibold text-[var(--lp-band-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]';

export default function BusinessProfilePage() {
  const messages = useTranslations();
  const t = messages.businessProfilePage;
  const common = messages.common;
  const router = useRouter();
  const { fetchState, isConnected, refresh } = useUserProfile();
  const { activeWorkspace, workspaces, isBusinessWorkspace, switchWorkspace } = useWorkspaceContext();
  const pending = isConnected && (fetchState === 'loading' || fetchState === 'idle');
  const businessWorkspace = workspaces.find((workspace) => workspace.kind === 'business');
  const showingBusiness = isBusinessWorkspace && activeWorkspace?.kind === 'business';
  const verified = activeWorkspace?.business?.verificationStatus === 'verified';

  return (
    <ProfileFrame title={t.label}>
      {pending ? (
        <p role="status" className="text-[15px] text-[var(--lp-text-sub)]">{common.loading}</p>
      ) : fetchState === 'error' ? (
        <div role="alert" className="space-y-2 text-[15px] text-[var(--lp-dark)]">
          <p>{t.loadError}</p>
          <button type="button" onClick={refresh} className="min-h-11 font-semibold underline underline-offset-4">{t.retry}</button>
        </div>
      ) : !businessWorkspace ? (
        <RowGroup>
          <Row label={t.setupTitle}>
            <Link href="/profile/business/setup" className={ACCENT_PILL}>{t.setup}</Link>
          </Row>
        </RowGroup>
      ) : (
        <>
          <RowGroup>
            <Row label={businessWorkspace.name} value={showingBusiness ? (verified ? undefined : t.setup) : undefined}>
              {showingBusiness ? null : (
                <button
                  type="button"
                  onClick={() => {
                    switchWorkspace(businessWorkspace.id);
                    router.push('/business/verification');
                  }}
                  className={ACCENT_PILL}
                >
                  {t.setup}
                </button>
              )}
            </Row>
            {showingBusiness ? <Row label={t.manage} href="/business/verification" /> : null}
            <Row label={t.edit} href="/profile/business/setup" />
            <Row label={messages.profile.hub.workspaces}><WorkspaceSwitcher /></Row>
          </RowGroup>
          <RowGroup>
            <Row label={t.findTitle} href="/partners" />
            <Row label={t.dealTitle} href="/market" />
            <Row label={t.payTitle} href="/buyer" />
            <Row label={t.recordTitle} href="/activity" />
          </RowGroup>
        </>
      )}
    </ProfileFrame>
  );
}
