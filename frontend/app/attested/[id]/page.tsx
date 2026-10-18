import type { Metadata } from 'next';
import { AttestedDealPage } from '@/features/reputation/components/AttestedDealPage';

/// One settled deal Karwan signed a statement about, readable by a person. The
/// signed credential itself stays at /attestations/:id/vc for machines.
export const metadata: Metadata = {
  title: 'Attested deal · Karwan',
  description: 'A settled deal Karwan has signed a public statement about.',
};

export default async function AttestedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AttestedDealPage id={id} />;
}
