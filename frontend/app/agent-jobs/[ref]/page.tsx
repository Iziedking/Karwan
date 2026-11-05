import { SellerJobPage } from '@/features/agentJobs/SellerJobPage';

/// One deal an outside agent funded, as its seller sees it (view 15).
export default async function AgentJob({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return <SellerJobPage jobRef={ref} />;
}
