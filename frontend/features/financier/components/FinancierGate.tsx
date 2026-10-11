'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { SECONDARY } from '@/shared/ui/controls';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { FinancierApply } from './FinancierApply';
import { FinancierDashboard } from './FinancierDashboard';

/// The financier surface lives in the SME rail but is open to ANYONE who clears
/// the bar (it is a capital-provider capability, not a business-trade surface,
/// so it is gated by financier approval, never by account kind). Until approved,
/// the user sees the application card; once approved, the live desk.
export function FinancierGate() {
  const auth = useAuth();
  const t = useTranslations().financierDashboard.gate;
  const q = useQuery({
    queryKey: ['financier', 'eligibility', auth.address],
    queryFn: () => api.financierEligibility(),
    enabled: auth.isAuthenticated && !!auth.address,
    staleTime: 30_000,
  });

  return (
    <AuthGuard gateTag={t.tag} gateBody={t.body}>
      {q.isLoading || (!q.data && !q.isError) ? (
        <FinancierGateSkeleton />
      ) : q.data?.status === 'approved' ? (
        <FinancierDashboard />
      ) : q.data ? (
        <FinancierApply eligibility={q.data} onApplied={() => q.refetch()} />
      ) : (
        <div className="mx-auto max-w-[940px] px-5 py-16 text-center">
          <p role="alert" className="text-[15px] font-medium text-[var(--lp-dark)]">{t.loadError}</p>
          <button type="button" onClick={() => q.refetch()} className={`${SECONDARY} mt-4`}>
            {t.retry}
          </button>
        </div>
      )}
    </AuthGuard>
  );
}

/// Skeleton for the financier gate while eligibility loads. Replaces the bare
/// "LOADING..." string (SKILL §6 rule 8: no loading text) with the desk's own
/// shape so the surface reads as "loading THIS" rather than a blank screen.
function FinancierGateSkeleton() {
  const pulse = 'animate-pulse motion-reduce:animate-none';
  return (
    <div className="mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] py-[clamp(40px,6vw,88px)]">
      <div className={`h-3.5 w-36 rounded bg-black/[0.06] ${pulse}`} />
      <div className={`mt-5 h-9 w-2/3 max-w-md rounded bg-black/[0.06] ${pulse}`} />
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-40 bg-black/[0.05] ${pulse}`}
            style={{
              borderRadius: 16,
            }}
          />
        ))}
      </div>
    </div>
  );
}
