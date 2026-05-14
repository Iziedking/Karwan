'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BuyerJob } from '@/core/api';
import { Card } from '@/shared/components/Card';
import { useJobSnapshot } from '../hooks/useJobSnapshot';
import { useJobLiveState } from '../hooks/useJobLiveState';
import { FlowStepper } from './FlowStepper';
import { EventList } from './EventList';
import { LiveBidsPanel } from './LiveBidsPanel';
import { ReleaseMilestonesButton } from './ReleaseMilestonesButton';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { shortHash, formatUsdc, relativeTime } from '@/shared/utils/format';

type StatusTone = 'positive' | 'warning' | 'accent' | 'default';

export function LiveJobPage({ initial, explorer }: { initial: BuyerJob; explorer: string }) {
  const { job } = useJobSnapshot(initial);
  const { events, active, completed } = useJobLiveState(job);

  const acceptedAt = events.find((e) => e.type === 'bid.accepted')?.ts;

  const status: { label: string; tone: StatusTone; live: boolean } = job.escrowFunded
    ? { label: `Escrow funded · ${formatUsdc(job.budgetUsdc)}`, tone: 'positive', live: false }
    : job.finalized
    ? { label: 'Accepted · funding escrow', tone: 'warning', live: true }
    : job.bids.length > 0
    ? { label: `${job.bids.length} bid${job.bids.length === 1 ? '' : 's'} · negotiating`, tone: 'accent', live: true }
    : { label: 'Open · waiting on seller agents', tone: 'default', live: true };

  return (
    <div className="space-y-8">
      <div className="fade-up">
        <Link
          href="/buyer"
          className="group inline-flex items-center gap-1 text-[12px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] mb-3 transition-colors"
        >
          <span
            aria-hidden
            className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5"
          >
            ←
          </span>
          <span className="transition-transform duration-200 group-hover:-translate-x-0.5">
            Back to buyer
          </span>
        </Link>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-1">
              Deal
            </p>
            <h1 className="text-[26px] tracking-tight font-semibold mono break-all">
              {shortHash(job.jobId, 10, 6)}
            </h1>
            <p className="text-[11px] mono text-[var(--color-ink-faint)] mt-1 break-all">{job.jobId}</p>
          </div>
          <StatusPill label={status.label} tone={status.tone} live={status.live} />
        </div>
      </div>

      <div className="fade-up fade-up-1 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Budget" value={<><span className="mono tabular-nums">{formatUsdc(job.budgetUsdc, { withSuffix: false })}</span><span className="text-[12px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)] ml-2">USDC</span></>} />
        <StatTile label="Bids" value={<span className="mono tabular-nums">{job.bids.length}</span>} />
        <StatTile label="Buyer deadline" value={<span className="text-[var(--color-ink)]">{relativeTime(job.deadlineUnix)}</span>} />
        <StatTile label="Terms hash" value={<span className="mono text-[14px]">{shortHash(job.termsHash, 6, 4)}</span>} />
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

      <div className="fade-up fade-up-3">
        <SettleSection job={job} acceptedAt={acceptedAt} />
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
  live,
}: {
  label: string;
  tone: StatusTone;
  live: boolean;
}) {
  const toneStyle: Record<
    StatusTone,
    { ink: string; ring: string; soft: string; glow: string; eyebrow: string; eyebrowLabel: string }
  > = {
    positive: {
      ink: 'var(--color-positive)',
      ring: 'color-mix(in srgb, var(--color-positive) 35%, transparent)',
      soft: 'var(--color-positive-soft)',
      glow: 'color-mix(in srgb, var(--color-positive) 45%, transparent)',
      eyebrow: 'color-mix(in srgb, var(--color-positive) 70%, var(--color-ink) 30%)',
      eyebrowLabel: 'Settled',
    },
    warning: {
      ink: 'var(--color-warning)',
      ring: 'color-mix(in srgb, var(--color-warning) 35%, transparent)',
      soft: 'var(--color-warning-soft)',
      glow: 'color-mix(in srgb, var(--color-warning) 50%, transparent)',
      eyebrow: 'color-mix(in srgb, var(--color-warning) 70%, var(--color-ink) 30%)',
      eyebrowLabel: 'In progress',
    },
    accent: {
      ink: 'var(--color-accent)',
      ring: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
      soft: 'var(--color-accent-soft)',
      glow: 'color-mix(in srgb, var(--color-accent) 45%, transparent)',
      eyebrow: 'color-mix(in srgb, var(--color-accent) 70%, var(--color-ink) 30%)',
      eyebrowLabel: 'Live',
    },
    default: {
      ink: 'var(--color-ink)',
      ring: 'var(--color-line-strong)',
      soft: 'var(--color-surface-2)',
      glow: 'transparent',
      eyebrow: 'var(--color-ink-faint)',
      eyebrowLabel: 'Open',
    },
  };
  const t = toneStyle[tone];
  const [primary, ...rest] = label.split(' · ');
  const secondary = rest.join(' · ');

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full border backdrop-blur-sm"
      style={{
        borderColor: t.ring,
        background: `linear-gradient(135deg, ${t.soft} 0%, transparent 60%, ${t.soft} 100%)`,
        boxShadow: live ? `0 0 0 4px ${t.glow}, 0 1px 2px rgba(0,0,0,0.04)` : '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 600ms ease',
      }}
    >
      {/* sheen sweep for live state */}
      {live && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -inset-x-2 stat-sweep"
          style={{
            background: `linear-gradient(110deg, transparent 35%, ${t.soft} 50%, transparent 65%)`,
            opacity: 0.5,
          }}
        />
      )}
      <div className="relative flex items-center gap-2.5 pl-2.5 pr-3.5 py-1.5">
        {/* concentric dot */}
        <span className="relative flex w-3 h-3 items-center justify-center">
          {live && (
            <>
              <span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background: t.ink,
                  opacity: 0.35,
                  animation: 'flowPulse 1.8s ease-out infinite',
                }}
              />
              <span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background: t.ink,
                  opacity: 0.25,
                  animation: 'flowPulse 1.8s ease-out infinite',
                  animationDelay: '0.6s',
                }}
              />
            </>
          )}
          <span
            className="relative w-1.5 h-1.5 rounded-full"
            style={{ background: t.ink, boxShadow: `0 0 0 2px ${t.soft}` }}
          />
        </span>
        <div className="flex flex-col leading-tight">
          <span
            className="text-[9px] uppercase tracking-[0.16em] font-semibold"
            style={{ color: t.eyebrow }}
          >
            {t.eyebrowLabel}
          </span>
          <span
            className="text-[12px] font-medium tracking-tight"
            style={{ color: t.ink }}
          >
            <span className="font-semibold">{primary}</span>
            {secondary && (
              <span className="ml-1 opacity-70 font-normal">· {secondary}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="group relative rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card-hover)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">{label}</p>
      <p className="mt-2 text-[20px] leading-none font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SettleSection({ job, acceptedAt }: { job: BuyerJob; acceptedAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  const fundingPhase = job.finalized && !job.escrowFunded;
  useEffect(() => {
    if (!fundingPhase) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fundingPhase]);

  if (job.escrowFunded) {
    return (
      <Card title="Settle">
        <p className="text-sm text-[var(--color-ink-dim)] mb-3">
          Escrow holds <span className="mono text-[var(--color-ink)]">{formatUsdc(job.budgetUsdc)}</span>.
          Release milestones to stream funds to the seller.
        </p>
        <ReleaseMilestonesButton jobId={job.jobId} totalMilestones={2} />
      </Card>
    );
  }

  if (fundingPhase) {
    const elapsed = acceptedAt ? Math.max(0, Math.floor((now - acceptedAt) / 1000)) : null;
    const stalled = elapsed != null && elapsed > 120;
    return (
      <Card title={stalled ? 'Funding stalled' : 'Funding escrow'}>
        {!stalled ? (
          <FundingProgress elapsed={elapsed ?? 0} amount={formatUsdc(job.budgetUsdc)} />
        ) : (
          <p className="text-sm text-[var(--color-ink-dim)]">
            Escrow has not funded in {formatElapsed(elapsed!)}.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card title="Settle" footer="Releases unlock after escrow funds.">
      <p className="text-sm text-[var(--color-ink-faint)]">
        Funds will be locked in escrow once the buyer agent accepts a final bid.
      </p>
    </Card>
  );
}

function FundingProgress({ elapsed }: { elapsed: number; amount: string }) {
  const approveDone = elapsed > 30;
  const fundDone = elapsed > 60;
  return (
    <div className="space-y-2">
      <FundingStep label="Approve" done={approveDone} active={!approveDone} />
      <FundingStep label="Fund escrow" done={fundDone} active={approveDone && !fundDone} />
    </div>
  );
}

function FundingStep({
  label,
  done,
  active,
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`relative shrink-0 w-4 h-4 rounded-full grid place-items-center transition-colors ${
          done
            ? 'bg-[var(--color-positive)] text-white'
            : active
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-surface-2)] border border-[var(--color-line)] text-[var(--color-ink-faint)]'
        }`}
      >
        {active && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: 'var(--color-accent)',
              opacity: 0.4,
              animation: 'flowPulse 1.8s ease-out infinite',
            }}
          />
        )}
        {done && (
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" className="relative">
            <path d="M3 8.5 L6.5 12 L13 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span
        className={`text-[13px] ${
          done || active ? 'text-[var(--color-ink)] font-medium' : 'text-[var(--color-ink-faint)]'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
