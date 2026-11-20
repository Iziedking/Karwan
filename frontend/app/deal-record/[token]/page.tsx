import type { Metadata } from 'next';
import { SharedDealRecordPage } from '@/features/deals/record/SharedDealRecordPage';

/// A finished deal's signed record, opened from a link one of its sides shared.
export const metadata: Metadata = {
  title: 'Deal record · Karwan',
  description: 'The signed record of a finished deal on Karwan.',
  robots: { index: false, follow: false },
};

export default async function DealRecordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedDealRecordPage token={token} />;
}
