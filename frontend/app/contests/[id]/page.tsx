import { ContestPage } from '@/features/contests/components/ContestPage';

/// One contest (view 40): anyone can read it; entering and picking need the
/// right person signed in.
export default async function Contest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContestPage id={id} />;
}
