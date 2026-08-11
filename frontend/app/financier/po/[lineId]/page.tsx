'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/core/api';
import { FinancingChatPanel } from '@/features/chat/components/FinancingChatPanel';
export default function Page() {
  const { lineId } = useParams<{ lineId: string }>();
  const [p, setP] = useState<any>();
  useEffect(() => { api.poFinancingLine(lineId).then(setP); }, [lineId]);
  if (!p) return <main>loading...</main>;
  return <main><a>back to financier</a><h1>po position: {p.line.state}</h1><p>principal {p.line.principalUsdc} usdc; return {p.line.repayUsdc} usdc</p><p>deal {p.deal?.status ?? 'unavailable'}; contract state {p.chainLine?.state ?? 'unavailable'}</p><FinancingChatPanel kind={'po'} positionId={lineId} /></main>;
}
