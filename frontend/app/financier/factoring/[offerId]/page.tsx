'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/core/api';
import { FinancingChatPanel } from '@/features/chat/components/FinancingChatPanel';
export default function Page() {
  const { offerId } = useParams<{ offerId: string }>();
  const [p, setP] = useState<any>();
  useEffect(() => { api.factoringPosition(offerId).then(setP); }, [offerId]);
  if (!p) return <main>loading...</main>;
  return <main><a>back to financier</a><h1>invoice position: {p.offer.status}</h1><p>advance {p.offer.offeredAdvanceUsdc} usdc; return {p.offer.expectedReturnUsdc} usdc</p><p>deal {p.deal?.status ?? 'unavailable'}; payee {p.assignedPayee ?? 'unavailable'}</p><FinancingChatPanel kind={'factoring'} positionId={offerId} /></main>;
}
