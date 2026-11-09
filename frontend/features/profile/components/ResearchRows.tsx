'use client';
import { useEffect, useState } from 'react';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { api, type AgentKitResearchStatus } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Row, RowGroup } from '../ui/ProfileUi';

/// Market research for the agents as three plain facts: what a search costs
/// (the agents pay it themselves, view 48), free reports left today and
/// whether the person is verified.
export function ResearchRows() {
  const s = useTranslations().profile.simple;
  const mt = useMoneyText();
  const [price, setPrice] = useState<{ freshSearchUsdc: number; cachedSearchUsdc: number } | null>(null);
  const [kit, setKit] = useState<AgentKitResearchStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.researchStatus()
      .then((next) => { if (!cancelled) setPrice(next); })
      .catch(() => { if (!cancelled) setPrice(null); });
    api.researchAgentKitStatus()
      .then((next) => { if (!cancelled) setKit(next); })
      .catch(() => { if (!cancelled) setKit(null); });
    return () => { cancelled = true; };
  }, []);

  const cost = price
    ? mt.fill(s.researchCostTemplate, { fresh: price.freshSearchUsdc, cached: price.cachedSearchUsdc })
    : s.notAvailable;
  const reports = kit?.allowance
    ? s.reportsLeftTemplate.replace('{left}', String(kit.allowance.remaining)).replace('{total}', String(kit.allowance.allowance))
    : kit?.allowancePolicy
      ? s.reportsPerDayTemplate.replace('{n}', String(kit.allowancePolicy.reportsPer24Hours))
      : s.notAvailable;
  const verified = !kit || kit.mode === 'unavailable' ? s.notAvailable : kit.verification === 'verified' ? s.yes : s.notYet;

  return (
    <div className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-[14px] font-semibold text-[var(--lp-text-sub)]">
        {s.researchTitle}
        <Hint side="bottom">{s.researchHint}</Hint>
      </h2>
      <RowGroup>
        <Row label={s.researchCostLabel} value={cost} />
        <Row label={s.freeReports} value={reports} />
        <Row label={s.verifiedPerson} value={verified} />
      </RowGroup>
    </div>
  );
}
