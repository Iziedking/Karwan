'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/core/api';
import { FinancingPositionWorkspace } from '@/features/financier/components/FinancingPositionWorkspace';
export default function Page() {
  const { lineId } = useParams<{ lineId: string }>();
  const [p, setP] = useState<any>();
  useEffect(() => { api.poFinancingLine(lineId).then(setP); }, [lineId]);
  if (!p) return <main className="min-h-screen bg-[var(--lp-bg)] p-6 text-sm text-[var(--lp-text-muted)]">Loading position…</main>;
  const status = p.line.state === 'outstanding' ? 'active' : p.line.state === 'repaid' ? 'repaid' : p.line.state === 'defaulted' ? 'review' : 'pending';
  return <FinancingPositionWorkspace kind="po" positionId={lineId} status={status} seller={p.line.seller} financier={p.line.financier} advanceUsdc={p.line.principalUsdc} expectedReturnUsdc={p.line.repayUsdc} protectionUsdc={p.line.requiredStakeUsdc} deal={p.deal} />;
}
