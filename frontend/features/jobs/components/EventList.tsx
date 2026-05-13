'use client';
import type { ChainEvent } from '@/core/api';
import { Tag, StatusDot } from '@/shared/components/Tag';
import { shortHash, relativeTime } from '@/shared/utils/format';

const labels: Record<string, { text: string; tone: 'buyer' | 'seller' | 'system' }> = {
  'job.tracked': { text: 'Job posted on chain', tone: 'system' },
  'bid.scored': { text: 'Buyer scored the bid', tone: 'buyer' },
  'bid.submitted': { text: 'Seller submitted bid', tone: 'seller' },
  'counter.issued': { text: 'Buyer issued counter-offer', tone: 'buyer' },
  'counter.response.submitted': { text: 'Seller responded to counter', tone: 'seller' },
  'bid.accepted': { text: 'Buyer accepted final terms', tone: 'buyer' },
  'escrow.approved': { text: 'USDC approved for escrow', tone: 'buyer' },
  'escrow.funded': { text: 'Escrow funded', tone: 'buyer' },
  'escrow.milestone.released': { text: 'Milestone released', tone: 'buyer' },
  'escrow.settled': { text: 'Escrow settled', tone: 'system' },
  'agent.skipped': { text: 'Seller skipped this job', tone: 'seller' },
};

const interesting = [
  'reason',
  'priceUsdc',
  'agreedPriceUsdc',
  'counterPriceUsdc',
  'counterPrice',
  'milestoneIndex',
  'confidence',
  'score',
];

export function EventList({
  events,
  explorer,
  showJobId,
}: {
  events: ChainEvent[];
  explorer: string;
  showJobId?: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-[var(--color-ink-faint)]">No events yet.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--color-line)] -my-3">
      {events.map((e, i) => {
        const meta = labels[e.type];
        const text = meta?.text ?? e.type;
        const tone = meta?.tone ?? 'system';
        const dotTone = tone === 'buyer' ? 'accent' : tone === 'seller' ? 'positive' : 'muted';
        const txHash = (e.payload?.txHash as string | undefined) ?? undefined;
        const parts: string[] = [];
        for (const k of interesting) {
          if (e.payload[k] != null) {
            parts.push(`${k}=${typeof e.payload[k] === 'string' ? e.payload[k] : JSON.stringify(e.payload[k])}`);
          }
        }
        return (
          <li key={`${e.ts}-${i}`} className="slide-in py-3 flex items-start gap-3">
            <span className="mt-1.5 shrink-0">
              <StatusDot tone={dotTone} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-[var(--color-ink)]">{text}</span>
                <span className="text-[11px] text-[var(--color-ink-faint)] mono shrink-0">
                  {relativeTime(e.ts)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                <Tag tone={tone === 'buyer' ? 'accent' : tone === 'seller' ? 'positive' : 'muted'}>{e.actor}</Tag>
                {showJobId && e.jobId && (
                  <span className="text-[11px] mono text-[var(--color-ink-faint)]">job {shortHash(e.jobId, 6, 4)}</span>
                )}
                {parts.length > 0 && (
                  <span className="text-[11px] mono text-[var(--color-ink-dim)]">{parts.join(' · ')}</span>
                )}
                {txHash && (
                  <a
                    href={`${explorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] mono text-[var(--color-accent)] underline decoration-dotted underline-offset-2"
                  >
                    {shortHash(txHash, 6, 4)}
                  </a>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
