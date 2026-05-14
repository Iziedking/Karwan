import { DirectDealDetail } from '@/features/deals/components/DirectDealDetail';

export default async function DirectDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DirectDealDetail jobId={id} />;
}
