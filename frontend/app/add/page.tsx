'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { AddMoneySheet, type AddSheetMode } from '@/features/money/components/AddMoneySheet';
import { leaveMoneyPage } from '@/features/money/moneyRoutes';

/// Add money as its own page (view 51, fourth round), the same from Home and
/// from Money. `?mode=moveToBalance` and `?mode=addToPool` open the Transfer
/// balance moves.
export default function AddPage() {
  return (
    <Suspense fallback={null}>
      <AddPageContent />
    </Suspense>
  );
}

function AddPageContent() {
  const t = useTranslations().moneyMove;
  const router = useRouter();
  const raw = useSearchParams().get('mode');
  const mode: AddSheetMode = raw === 'moveToBalance' || raw === 'addToPool' ? raw : 'add';
  return (
    <AuthGuard gateTag={t.add.title} gateBody={t.add.connectNote}>
      <AddMoneySheet page mode={mode} onClose={() => leaveMoneyPage(router)} />
    </AuthGuard>
  );
}
