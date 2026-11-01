import { DealWorkspace } from '@/features/deals/workspace/DealWorkspace';

export default async function DirectDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DealWorkspace jobId={id} />;
}
