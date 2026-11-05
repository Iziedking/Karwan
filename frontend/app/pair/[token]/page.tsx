import { PairPage } from '@/features/agentJobs/PairPage';

/// The one-time World ID pairing an outside agent sends its person (view 15).
export default async function Pair({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PairPage token={token} />;
}
