'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WorkForm } from '@/features/work/components/WorkForm';

/// Hire by the hour (view 32). A card from the assistant or a chat channel
/// opens here with its answers filled in: ?to, kind, rate, hours, periods,
/// starts, title, brief.
export default function NewWorkPage() {
  return (
    <Suspense fallback={null}>
      <NewWork />
    </Suspense>
  );
}

function NewWork() {
  const t = useTranslations().work;
  const q = useSearchParams();
  const num = (key: string) => {
    const n = Number(q.get(key));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const prefill = {
    worker: q.get('to') ?? undefined,
    kind: q.get('kind') === 'monthly' ? ('monthly' as const) : ('hourly' as const),
    rateUsdc: q.get('rate') ?? undefined,
    maxHours: num('hours'),
    periods: num('periods'),
    startsInDays: num('starts'),
    title: q.get('title') ?? undefined,
    brief: q.get('brief') ?? undefined,
  };
  return (
    <AuthGuard gateTag={t.form.title} gateBody={t.start.body}>
      <WorkForm prefill={prefill} />
    </AuthGuard>
  );
}
