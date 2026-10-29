'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ContestForm } from '@/features/contests/components/ContestForm';

/// Run a contest (view 40). A card from the assistant or a chat channel opens
/// here with its answers filled in: ?title, brief, prize, places, days, pick.
export default function NewContestPage() {
  return (
    <Suspense fallback={null}>
      <NewContest />
    </Suspense>
  );
}

function NewContest() {
  const t = useTranslations().contests;
  const q = useSearchParams();
  const num = (key: string) => {
    const n = Number(q.get(key));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const prefill = {
    title: q.get('title') ?? undefined,
    brief: q.get('brief') ?? undefined,
    prizeUsdc: q.get('prize') ?? undefined,
    places: num('places'),
    entriesDays: num('days'),
    awardDays: num('pick'),
  };
  return (
    <AuthGuard gateTag={t.form.title} gateBody={t.start.body}>
      <ContestForm prefill={prefill} />
    </AuthGuard>
  );
}
