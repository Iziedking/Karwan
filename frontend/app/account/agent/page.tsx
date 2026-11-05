'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { MoneySheet } from '@/features/money/components/MoneySheet';
import { leaveMoneyPage, moneyHref } from '@/features/money/moneyRoutes';

/// Top up or withdraw from your agent as its own page (view 51, fifth round),
/// opened from Money's Agent tab. `?move=topUp|withdraw`, `?agent=buyer|seller`.
export default function AgentMovePage() {
  return (
    <Suspense fallback={null}>
      <AgentMovePageContent />
    </Suspense>
  );
}

function AgentMovePageContent() {
  const t = useTranslations().moneyPages.agent;
  const router = useRouter();
  const params = useSearchParams();
  const move = params.get('move') === 'withdraw' ? 'withdraw' : 'topUp';
  const agent = params.get('agent') === 'seller' ? 'seller' : 'buyer';
  const amount = Number(params.get('amount'));
  const leave = () => leaveMoneyPage(router, moneyHref('agent'));
  return (
    <AuthGuard gateTag={t.withAgent} gateBody={t.topUpTitle}>
      <MoneySheet
        page
        open
        move={move}
        agent={agent}
        prefillAmount={Number.isFinite(amount) && amount > 0 ? amount : undefined}
        pageTitle={move === 'withdraw' ? t.withdrawTitle : t.topUpTitle}
        onClose={leave}
      />
    </AuthGuard>
  );
}
