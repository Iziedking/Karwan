import { JobPageClient } from '@/features/jobs/components/JobPageClient';

/// Thin server shell. All data fetching happens client-side inside
/// JobPageClient so navigation is instant and the existing loading.tsx
/// covers the transition. Previously this was an async server component
/// that awaited api.job(id) + api.status() before returning JSX, which
/// blocked the route from rendering until both calls resolved.
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobPageClient jobId={id} />;
}
