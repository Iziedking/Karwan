'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { SendFlow } from '@/features/money/components/SendFlow';

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
  const note = useSearchParams().get('note') ?? undefined;
  const said = useSearchParams().get('said');
  const cur = useSearchParams().get('cur');
  return (
    <AuthGuard gateTag={t.sheet.titleSend} gateBody={t.sendPage.gateBody}>
      <SendFlow
        prefillRecipient={to}
        prefillAmount={Number.isFinite(amount) && amount > 0 ? amount : undefined}
        prefillSaid={said && cur && /^\d{1,15}(\.\d{1,2})?$/.test(said) ? { currency: cur, amount: said } : undefined}
        prefillNote={note}
        onClose={() => router.push('/account')}
      />
    </AuthGuard>
  );
}
