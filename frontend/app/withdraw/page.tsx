'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WithdrawFlow } from '@/features/money/components/WithdrawFlow';
import { leaveMoneyPage } from '@/features/money/moneyRoutes';

/// Withdraw as its own page (view 51, fourth round). `?amount=` and `?to=`
/// carry over from an old link or the assistant.
export default function WithdrawPage() {
  return (
    <Suspense fallback={null}>
      <WithdrawPageContent />
    </Suspense>
  );
}

function WithdrawPageContent() {
  const t = useTranslations().moneyPages.withdraw;
  const router = useRouter();
  const params = useSearchParams();
  const amount = Number(params.get('amount'));
  const to = params.get('to') ?? undefined;
  return (
    <AuthGuard gateTag={t.title} gateBody={t.anotherNote}>
      <WithdrawFlow
        prefillAmount={Number.isFinite(amount) && amount > 0 ? amount : undefined}
        prefillAddress={to && /^0x[a-fA-F0-9]{40}$/.test(to) ? to : undefined}
        onClose={() => leaveMoneyPage(router)}
      />
    </AuthGuard>
  );
}
