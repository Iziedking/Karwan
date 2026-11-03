'use client';
import type { DirectDeal } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { dealRoute } from './dealRoute';
import { StepsTrack } from './workspace/StepsTrack';

/// A deal's route, or the one status line that replaces it once the deal has
/// stopped moving forward (disputed, cancelled, refunded, settled by a ruling).
export function DealRoute({ deal }: { deal: DirectDeal }) {
  const t = useTranslations().dealPage;
  const route = dealRoute(deal);
  if (route.kind === 'status') {
    return (
      <p data-route-status={route.status} className="text-[15px] font-medium text-[var(--ink)]">
        {t.routeStatus[route.status]}
      </p>
    );
  }
  return <StepsTrack steps={route.stops} />;
}
