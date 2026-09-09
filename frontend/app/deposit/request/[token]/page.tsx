'use client';

import { useParams } from 'next/navigation';
import { DepositRequestView } from '@/features/deposit/components/DepositRequestView';

export default function DepositRequestPage() {
  const params = useParams<{ token: string }>();
  return <DepositRequestView token={params.token} />;
}
