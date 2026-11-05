import { ReleasePage } from '@/features/agentJobs/ReleasePage';

/// The person's answer to delivered work from an outside agent's deal (view 15).
export default async function Release({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReleasePage token={token} />;
}
