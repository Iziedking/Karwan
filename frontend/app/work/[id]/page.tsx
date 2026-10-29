'use client';
import { use } from 'react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WorkPage } from '@/features/work/components/WorkPage';

/// One piece of hourly work (view 32): only the hirer and the worker see it.
export default function Work({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations().work;
  return (
    <AuthGuard gateTag={t.form.title} gateBody={t.start.body}>
      <WorkPage id={id} />
    </AuthGuard>
  );
}
