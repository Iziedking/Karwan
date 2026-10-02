'use client';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { CreatePayLink } from '@/features/payLink/CreatePayLink';

export default function RequestPaymentPage() {
  const copy = useTranslations().payLink.create;
  return (
    <AuthGuard gateTitle={copy.title}>
      <CreatePayLink />
    </AuthGuard>
  );
}
