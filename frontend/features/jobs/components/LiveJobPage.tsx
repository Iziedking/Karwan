'use client';
import Link from 'next/link';
import type { BuyerJob } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { Field, Stat } from '@/shared/components/Stat';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { useJobSnapshot } from '../hooks/useJobSnapshot';
import { useJobLiveState } from '../hooks/useJobLiveState';
import { FlowStepper } from './FlowStepper';
import { EventList } from './EventList';
import { LiveBidsPanel } from './LiveBidsPanel';
import { ReleaseMilestonesButton } from './ReleaseMilestonesButton';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { shortAddress, shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';

export function LiveJobPage({ initial, explorer }: { initial: BuyerJob; explorer: string }) {
  const { job } = useJobSnapshot(initial);
  const { events, active, completed } = useJobLiveState(job);

  const statusTag = job.escrowFunded
    ? { label: `Escrow funded · ${formatUsdc(job.budgetUsdc)}`, tone: 'positive' as const, dot: 'positive' as const }
    : job.finalized
      ? { label: 'Accepted', tone: 'warning' as const, dot: 'warning' as const }
      : job.bids.length > 0
        ? { label: `${job.bids.length} bid${job.bids.length === 1 ? '' : 's'}`, tone: 'accent' as const, dot: 'accent' as const }
        : { label: 'Open', tone: 'default' as const, dot: 'default' as const };

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <Link href="/buyer" className="text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] mb-3 inline-block">
          ← Back to buyer
        </Link>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[26px] tracking-tight font-semibold mono break-all">
              {shortHash(job.jobId, 10, 6)}
            </h1>
            <p className="text-[11px] mono text-[var(--color-ink-faint)] mt-1 break-all">{job.jobId}</p>
          </div>
          <span className="inline-flex items-center gap-2 shrink-0">
            <StatusDot tone={statusTag.dot} />
            <Tag tone={statusTag.tone}>{statusTag.label}</Tag>
          </span>
        </div>
      </div>

      <div className="fade-up fade-up-1 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <Stat label="Budget" value={formatUsdc(job.budgetUsdc)} mono />
        </Card>
        <Card>
          <Stat label="Bids" value={job.bids.length} mono />
        </Card>
        <Card>
          <Stat label="Buyer deadline" value={relativeTime(job.deadlineUnix)} />
        </Card>
        <Card>
          <Stat label="Terms hash" value={<span className="mono text-[12px]">{shortHash(job.termsHash, 6, 4)}</span>} />
        </Card>
      </div>

      <div className="fade-up fade-up-2 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <FlowStepper active={active} completed={completed} />
          </Card>
          <Card title="Timeline">
            <EventList events={events} explorer={explorer} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Bids" noPadding>
            <LiveBidsPanel initial={job} />
          </Card>
          <BalancesCard />
        </div>
      </div>

      <div className="fade-up fade-up-3 grid md:grid-cols-2 gap-4">
        <Card title="Parties">
          <div className="space-y-3.5">
            <Field label="Buyer" value={job.buyer} copy={job.buyer} />
            {job.bids[0] && <Field label="Lead seller" value={job.bids[0].seller} copy={job.bids[0].seller} />}
          </div>
        </Card>
        {job.escrowFunded ? (
          <Card title="Settle">
            <p className="text-sm text-[var(--color-ink-dim)] mb-3">
              Escrow holds <span className="mono text-[var(--color-ink)]">{formatUsdc(job.budgetUsdc)}</span>. Release milestones to stream funds to the seller.
            </p>
            <ReleaseMilestonesButton jobId={job.jobId} totalMilestones={2} />
          </Card>
        ) : (
          <Card title="Settle" footer="Releases unlock after escrow funds.">
            <p className="text-sm text-[var(--color-ink-faint)]">
              Escrow funds automatically when the buyer agent locks in the deal.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
