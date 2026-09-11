'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { AccountHome } from '@/features/home/components/AccountHome';
import { Band, FullBleed, GridOverlay, HeroHeadline, Punc, SectionTag } from '@/shared/components/Bands';
import { SignInGate } from '@/shared/components/SignInGate';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';

export default function AppHome() {
  const t = useTranslations().appHome;
  const { profile, isConnected, loading, fetchState } = useUserProfile();
  const { activeWorkspace, isBusinessWorkspace } = useWorkspaceContext();
  const { isLoading: authLoading } = useAuth();
  const statusQuery = useQuery({
    queryKey: qk.status(),
    queryFn: () => api.status(),
    staleTime: 60_000,
  });
  useEffect(() => {
    if (isConnected && fetchState === 'success' && !profile) {
      window.location.assign('/onboarding');
    }
  }, [fetchState, isConnected, profile]);

  if (authLoading) return <HomeSkeleton />;
  if (!isConnected) return <SignInGate variant="hero" />;

  if (!statusQuery.isPending && !statusQuery.data) {
    return (
      <FullBleed>
        <Band tone="light">
          <SectionTag>{t.backendOffline.eyebrow}</SectionTag>
          <HeroHeadline>
            {t.backendOffline.title}<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 max-w-md text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
            {t.backendOffline.bodyPrefix}
            <span className="mono text-[var(--lp-dark)]">{api.baseUrl}</span>
            {t.backendOffline.bodySuffix}
          </p>
        </Band>
      </FullBleed>
    );
  }

  if (loading || !profile) return <HomeSkeleton />;

  const displayName = isBusinessWorkspace
    ? activeWorkspace?.name || profile.smeProfile?.companyName || profile.displayName
    : profile.displayName;

  return (
    <AccountHome
      profile={profile}
      displayName={displayName}
      accountKind={isBusinessWorkspace ? 'business' : 'person'}
    />
  );
}

function HomeSkeleton() {
  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <SectionTag tone="dark">Account home</SectionTag>
        <div className="mt-7 max-w-2xl space-y-4">
          <div className="h-14 w-3/4 animate-pulse rounded-md bg-[var(--lp-workspace-soft)] motion-reduce:animate-none" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-[var(--lp-workspace-soft)] motion-reduce:animate-none" />
        </div>
      </Band>
    </FullBleed>
  );
}
