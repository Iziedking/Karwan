import { api } from '@/core/api';
import { LiveJobPage } from '@/features/jobs/components/LiveJobPage';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  CTAPill,
} from '@/shared/components/Bands';

export const dynamic = 'force-dynamic';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, status] = await Promise.all([
    api.job(id).catch((err) => ({ error: (err as Error).message }) as const),
    api.status().catch(() => null),
  ]);

  if ('error' in job) {
    // Most common path here: the brief expired and the buyer agent no longer
    // tracks it, so /api/jobs/:id 404s. Surface a clean Phantom-grade state
    // rather than a generic card, and offer a way back to the buyer desk.
    const isExpired = /not found/i.test(job.error);
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[48ch] fade-up">
            <SectionTag tone="dark">
              {isExpired ? 'BRIEF NO LONGER TRACKED' : 'JOB ERROR'}
            </SectionTag>
            <HeroHeadline size="md">
              {isExpired ? 'This brief expired' : 'Could not load this job'}
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {isExpired
                ? "It passed its deadline without a feasible match, so the agent stopped tracking it. The chain still holds the original brief; nothing was funded."
                : 'The job id may be wrong, or the backend has not seen it.'}
            </p>
            <p className="mt-3 mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-white/45 break-all">
              {id}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/buyer">Back to buyer desk</CTAPill>
              <CTAPill href="/activity" variant="secondary" tone="dark">
                See activity
              </CTAPill>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  const explorer = status?.chain.explorer ?? 'https://testnet.arcscan.app';
  return <LiveJobPage initial={job} explorer={explorer} />;
}
