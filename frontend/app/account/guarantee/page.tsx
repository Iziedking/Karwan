'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { GuaranteeStep } from '@/core/api';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { GuaranteeMove } from '@/features/guarantee/GuaranteeMove';
import { leaveMoneyPage, moneyHref } from '@/features/money/moneyRoutes';

const STEPS: GuaranteeStep[] = ['put_up', 'take_out', 'collect', 'cancel'];

/// A Deal guarantee move as its own page (view 51, fifth round), opened from
/// Money's Deal guarantee tab. `?step=put_up|take_out|collect|cancel`.
export default function GuaranteeMovePage() {
  return (
    <Suspense fallback={null}>
      <GuaranteeMovePageContent />
    </Suspense>
  );
}

function GuaranteeMovePageContent() {
  const g = useTranslations().dealGuarantee;
  const router = useRouter();
  const raw = useSearchParams().get('step') as GuaranteeStep | null;
  const step: GuaranteeStep = raw && STEPS.includes(raw) ? raw : 'put_up';
  return (
    <AuthGuard gateTag={g.signedOut.tag} gateBody={g.signedOut.body}>
      <GuaranteeMove step={step} onClose={() => leaveMoneyPage(router, moneyHref('guarantee'))} />
    </AuthGuard>
  );
}
