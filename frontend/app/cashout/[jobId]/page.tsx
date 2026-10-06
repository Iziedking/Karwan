'use client';
import { useParams } from 'next/navigation';
import { Accent, Punc } from '@/shared/components/Bands';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { CashoutView } from '@/features/cashout/CashoutView';

export default function CashoutPage() {
  const cp = useTranslations().cashoutPage;
  const params = useParams<{ jobId: string }>();
  return (
    <AuthGuard
      gateTag={cp.signInGate.tag}
      gateTitle={
        <>
          {cp.signInGate.titleBefore} <Accent>USDC</Accent>
          <Punc>.</Punc>
        </>
      }
      gateBody={cp.signInGate.body}
      gateButtonLabel={cp.signInGate.buttonLabel}
    >
      <CashoutView jobId={params?.jobId ?? ''} />
    </AuthGuard>
  );
}
