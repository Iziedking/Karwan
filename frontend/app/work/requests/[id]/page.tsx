import { WorkRequestPage } from '@/features/work/components/WorkRequestPage';

/// Posted hourly work (view 32): anyone can read it; offering and hiring need
/// the right person signed in.
export default async function WorkRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkRequestPage id={id} />;
}
