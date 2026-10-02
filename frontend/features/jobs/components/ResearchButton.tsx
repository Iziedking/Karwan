'use client';
import { useState } from 'react';
import type { MatchProposal } from '@/core/api';
import { Icon } from '@/shared/components/Icon';
import { MarketReadCard } from '@/shared/components/MarketReadCard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Sheet } from '@/features/deals/workspace/Sheet';
import { AgentX402Panel } from '@/shared/components/AgentX402Panel';

/// A small round button that opens what the agents researched and spent for
/// this request. Most people never need it, so it stays out of the way.
export function ResearchButton({ jobId, proposal, role }: { jobId: string; proposal: MatchProposal | null; role: 'buyer' | 'seller' }) {
  const copy = useTranslations().requestPage;
  const [open, setOpen] = useState(false);
  const paid = proposal?.paidSignal;
  const hasNews = !!proposal?.marketRead || !!paid;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={copy.research}
        className="relative grid size-11 shrink-0 place-items-center rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-outline-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        <Icon name="chart" size={20} />
        {hasNews ? <span aria-hidden className="absolute end-1 top-1 size-2.5 rounded-full bg-[var(--lp-accent)]" /> : null}
      </button>
      <Sheet open={open} title={copy.research} onClose={() => setOpen(false)}>
        <div className="space-y-5">
          {proposal?.marketRead ? <MarketReadCard mr={proposal.marketRead} role={role} /> : null}
          {paid ? (
            <div>
              <p className="text-[13px] font-semibold text-[var(--lp-text-sub)]">{copy.verification}</p>
              <p className="mt-1 text-[15px] text-[var(--lp-dark)]">{copy.verificationTemplate.replace('{amount}', String(paid.amountUsd))}</p>
            </div>
          ) : null}
          {!hasNews ? <p className="text-[15px] text-[var(--lp-text-sub)]">{copy.researchEmpty}</p> : null}
          <AgentX402Panel jobId={jobId} viewerRole={role} />
        </div>
      </Sheet>
    </>
  );
}
