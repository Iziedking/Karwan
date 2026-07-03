'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { FinancierApply } from './FinancierApply';
import { FinancierDashboard } from './FinancierDashboard';

/// The financier surface lives in the SME rail but is open to ANYONE who clears
/// the bar (it is a capital-provider capability, not a business-trade surface,
/// so it is gated by financier approval, never by account kind). Until approved,
/// the user sees the application card; once approved, the live desk.
export function FinancierGate() {
  const auth = useAuth();
  const q = useQuery({
    queryKey: ['financier', 'eligibility', auth.address],
    queryFn: () => api.financierEligibility(),
    enabled: auth.isAuthenticated && !!auth.address,
    staleTime: 30_000,
  });

  return (
    <AuthGuard gateTag="FINANCIER" gateBody="Sign in to fund trade on Karwan.">
      {q.isLoading || (!q.data && !q.isError) ? (
        <FinancierGateSkeleton />
      ) : q.data?.status === 'approved' ? (
        <FinancierDashboard />
      ) : q.data ? (
        <FinancierApply eligibility={q.data} onApplied={() => q.refetch()} />
      ) : (
        <div className="mx-auto max-w-[1440px] px-[clamp(20px,5vw,72px)] py-16 text-center">
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            Could not load your financier status.
          </p>
          <button
            type="button"
            onClick={() => q.refetch()}
            className="mt-4 inline-flex items-center px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.1em] border border-[var(--lp-border-light)] text-[var(--lp-dark)] hover:border-[var(--lp-dark)] transition-colors"
            style={{ borderRadius: 10 }}
          >
            Try again
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
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 4,
            }}
          />
        ))}
      </div>
    </div>
  );
}
