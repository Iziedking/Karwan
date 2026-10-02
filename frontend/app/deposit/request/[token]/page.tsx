'use client';

import { useParams } from 'next/navigation';
import { PayRequestView } from '@/features/payLink/PayRequestView';

export default function PayRequestPage() {
  const params = useParams<{ token: string }>();
  return <PayRequestView token={params.token} />;
}
