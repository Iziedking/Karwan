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
        <div className="py-20 text-center mono text-[11px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
          Loading...
        </div>
      ) : q.data?.status === 'approved' ? (
        <FinancierDashboard />
      ) : q.data ? (
        <FinancierApply eligibility={q.data} onApplied={() => q.refetch()} />
      ) : (
        <div className="py-20 text-center mono text-[11px] uppercase tracking-[0.16em] text-[var(--lp-critical)]">
          Could not load your financier status. Refresh to try again.
        </div>
      )}
    </AuthGuard>
  );
}
