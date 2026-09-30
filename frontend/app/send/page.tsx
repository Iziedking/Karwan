'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { MoneySheet } from '@/features/money/components/MoneySheet';

/// Send USDC to a Karwan tag or an Arc address. `?to=@ada` fills the recipient.
export default function SendPage() {
  return (
    <Suspense fallback={null}>
      <SendPageContent />
    </Suspense>
  );
}

function SendPageContent() {
  const t = useTranslations().money;
  const router = useRouter();
  const to = useSearchParams().get('to') ?? undefined;
  const amount = Number(useSearchParams().get('amount'));
  return (
    <AuthGuard gateTag={t.sheet.titleSend} gateBody={t.sendPage.gateBody}>
      <MoneySheet
        layout="page"
        open
        move="send"
        agent="buyer"
        prefillRecipient={to}
        prefillAmount={Number.isFinite(amount) && amount > 0 ? amount : undefined}
        onClose={() => router.push('/account')}
      />
    </AuthGuard>
  );
}
