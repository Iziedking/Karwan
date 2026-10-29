'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WorkRequestForm } from '@/features/work/components/WorkRequestForm';

/// Post hourly work on the market (view 32). A card from the assistant opens
/// here with its answers filled in: ?kind, title, brief, most, hours, periods, starts.
export default function NewWorkRequestPage() {
  return (
    <Suspense fallback={null}>
      <NewWorkRequest />
    </Suspense>
  );
}

function NewWorkRequest() {
  const t = useTranslations().work;
  const q = useSearchParams();
  const num = (key: string) => {
    const n = Number(q.get(key));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const prefill = {
    kind: q.get('kind') === 'monthly' ? ('monthly' as const) : ('hourly' as const),
    title: q.get('title') ?? undefined,
    brief: q.get('brief') ?? undefined,
    maxRateUsdc: q.get('most') ?? undefined,
    maxHours: num('hours'),
    periods: num('periods'),
    startsInDays: num('starts'),
  };
  return (
    <AuthGuard gateTag={t.requests.form.title} gateBody={t.requests.findBody}>
      <WorkRequestForm prefill={prefill} />
    </AuthGuard>
  );
}
