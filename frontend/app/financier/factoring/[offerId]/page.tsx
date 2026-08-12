'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useParams } from 'next/navigation';
import { api } from '@/core/api';
import { FinancingPositionWorkspace } from '@/features/financier/components/FinancingPositionWorkspace';
export default function Page() {
  const pb = useTranslations().pageBits;
  const { offerId } = useParams<{ offerId: string }>();
  const [p, setP] = useState<any>();
  useEffect(() => { api.factoringPosition(offerId).then(setP); }, [offerId]);
  if (!p) return <main className="min-h-screen bg-[var(--lp-bg)] p-6 text-sm text-[var(--lp-text-muted)]">{pb.financierPanels.loadingPosition}</main>;
  const status = p.offer.status === 'accepted' ? 'active' : p.offer.status === 'settled' ? 'repaid' : p.offer.status === 'defaulted' ? 'review' : p.offer.status === 'expired' ? 'expired' : p.offer.status === 'rejected' ? 'declined' : 'pending';
  return <FinancingPositionWorkspace kind="factoring" positionId={offerId} status={status} seller={p.offer.seller} financier={p.offer.financier} advanceUsdc={p.offer.offeredAdvanceUsdc} expectedReturnUsdc={p.offer.expectedReturnUsdc} deal={p.deal} />;
}
