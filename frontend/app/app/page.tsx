'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { AccountHome } from '@/features/home/components/AccountHome';
import { Button } from '@/shared/components/Button';
import { SignInGate } from '@/shared/components/SignInGate';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';

export default function AppHome() {
  const copy = useTranslations();
  const t = copy.appHome;
  const { profile, isConnected, loading, fetchState } = useUserProfile();
  const { activeWorkspace, isBusinessWorkspace } = useWorkspaceContext();
  const { isLoading: authLoading } = useAuth();
  const router = useRouter();
  const statusQuery = useQuery({
    queryKey: qk.status(),
    queryFn: () => api.status(),
    staleTime: 60_000,
  });
  useEffect(() => {
    if (isConnected && fetchState === 'success' && !profile) {
      router.replace('/start?mode=signup');
    }
  }, [fetchState, isConnected, profile, router]);

  if (authLoading) return <HomeSkeleton />;
  if (!isConnected) return <SignInGate variant="hero" />;

  if (!statusQuery.isPending && !statusQuery.data) {
    return (
      <section aria-labelledby="account-recovery-title" className="product-surface mx-auto w-full max-w-[640px] py-6 sm:py-10">
        <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{t.backendOffline.eyebrow}</p>
        <h1 id="account-recovery-title" className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">{t.backendOffline.title}</h1>
        <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-[var(--ink-secondary)]">
          {t.backendOffline.bodyPrefix}{t.backendOffline.bodySuffix}
        </p>
        <Button type="button" onClick={() => void statusQuery.refetch()} loading={statusQuery.isFetching} className="mt-6 rounded-full">
          {copy.accountHome.balanceRetry}
        </Button>
      </section>
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

/// Same frame as the account home, so the page does not jump when it loads.
function HomeSkeleton() {
  const soft = 'animate-pulse rounded-[12px] bg-[var(--lp-workspace-soft)] motion-reduce:animate-none';
  return (
    <div aria-busy="true" className="product-surface mx-auto w-full max-w-[1180px] pb-12">
      <div className={`mt-4 h-4 w-40 ${soft}`} />
      <div className="mt-4 w-full rounded-[22px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4 sm:rounded-[24px] sm:p-6 lg:max-w-[460px]">
        <div className={`h-4 w-24 ${soft}`} />
        <div className={`mt-3 h-11 w-48 ${soft}`} />
        <div className={`mt-3 h-3.5 w-64 max-w-full ${soft}`} />
        <div className="mt-4 grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className={`h-11 ${soft}`} />)}
        </div>
      </div>
    </div>
  );
}
