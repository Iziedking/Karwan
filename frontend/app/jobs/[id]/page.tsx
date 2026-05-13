import Link from 'next/link';
import { api } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { LiveJobPage } from '@/features/jobs/components/LiveJobPage';

export const dynamic = 'force-dynamic';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, status] = await Promise.all([
    api.job(id).catch((err) => ({ error: (err as Error).message }) as const),
    api.status().catch(() => null),
  ]);

  if ('error' in job) {
    return (
      <div className="space-y-4 fade-up">
        <Link href="/buyer" className="text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]">
          ← Back
        </Link>
        <Card title="Job not found">
          <p className="text-sm text-[var(--color-ink-dim)] mono">{job.error}</p>
        </Card>
      </div>
    );
  }

  const explorer = status?.chain.explorer ?? 'https://testnet.arcscan.app';
  return <LiveJobPage initial={job} explorer={explorer} />;
}
