'use client';

import Link from 'next/link';
import type { DirectDeal } from '@/core/api';
import { FinancingChatPanel } from '@/features/chat/components/FinancingChatPanel';
import { shortAddress } from '@/shared/utils/format';

type Status = 'pending' | 'active' | 'repaid' | 'declined' | 'expired' | 'review';

const STATUS: Record<Status, { label: string; detail: string; tone: string }> = {
  pending: { label: 'Offer pending', detail: 'Waiting for the seller to decide', tone: '#9a641f' },
  active: { label: 'Active', detail: 'Financing is active and linked to settlement', tone: '#276b85' },
  repaid: { label: 'Repaid', detail: 'The financier has been repaid', tone: '#238c58' },
  declined: { label: 'Declined', detail: 'The financing offer was not accepted', tone: '#6b6b6b' },
  expired: { label: 'Expired', detail: 'The financing offer expired', tone: '#6b6b6b' },
  review: { label: 'Needs review', detail: 'Repayment needs attention', tone: '#a33a32' },
};

function dealProgress(deal: DirectDeal | null): { label: string; step: number } {
  if (!deal) return { label: 'Deal details unavailable', step: 1 };
  if (deal.settledAt) return { label: 'Settlement completed', step: 4 };
  if (deal.disputed) return { label: 'Deal under review', step: 3 };
  if (deal.delivered) return { label: 'Delivery submitted', step: 3 };
  if (deal.fundTxHash) return { label: 'Work in progress', step: 2 };
  return { label: 'Deal accepted', step: 1 };
}

export function FinancingPositionWorkspace(props: {
  kind: 'factoring' | 'po';
  positionId: string;
  status: Status;
  seller: string;
  financier: string;
  advanceUsdc: string;
  expectedReturnUsdc: string;
  deal: DirectDeal | null;
  protectionUsdc?: string;
}) {
  const status = STATUS[props.status];
  const progress = dealProgress(props.deal);
  const steps = props.kind === 'po'
    ? ['Advance funded', 'Seller fulfils order', 'Buyer releases escrow', 'Financier repaid']
    : ['Early payment funded', 'Delivery accepted', 'Buyer releases escrow', 'Financier repaid'];

  return (
    <main className="min-h-screen bg-[var(--lp-bg)] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <Link href="/financier" className="mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--lp-text-sub)] underline underline-offset-4">
          ← Back to financing desk
        </Link>

        <header className="mt-5 border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-7" style={{ borderRadius: 18 }}>
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <p className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">Private financing workspace</p>
              <h1 className="mt-2 text-2xl font-semibold text-[var(--lp-dark)] sm:text-3xl">
                {props.kind === 'po' ? 'Purchase order financing' : 'Invoice early payment'}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--lp-text-sub)]">
                Private between the seller and financier. The buyer cannot view this position or conversation.
              </p>
            </div>
            <div className="md:text-right">
              <span className="mono inline-flex px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: status.tone, background: `color-mix(in srgb, ${status.tone} 12%, transparent)` }}>
                {status.label}
              </span>
              <p className="mt-2 text-xs text-[var(--lp-text-sub)]">{status.detail}</p>
            </div>
          </div>
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <section className="border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-6" style={{ borderRadius: 16 }}>
              <h2 className="text-lg font-semibold text-[var(--lp-dark)]">Position summary</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div className="border border-[var(--lp-border-light)] bg-white/45 p-3">
                  <dt className="mono text-[9px] uppercase tracking-[0.13em] text-[var(--lp-text-muted)]">Amount financed</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--lp-dark)]">{props.advanceUsdc} USDC</dd>
                </div>
                <div className="border border-[var(--lp-border-light)] bg-white/45 p-3">
                  <dt className="mono text-[9px] uppercase tracking-[0.13em] text-[var(--lp-text-muted)]">Expected repayment</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-[var(--lp-dark)]">{props.expectedReturnUsdc} USDC</dd>
                </div>
                {props.protectionUsdc ? <div className="col-span-2 border border-[var(--lp-border-light)] bg-white/45 p-3">
                  <dt className="mono text-[9px] uppercase tracking-[0.13em] text-[var(--lp-text-muted)]">Seller protection reserved</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-[var(--lp-dark)]">{props.protectionUsdc} USDC</dd>
                </div> : null}
              </dl>
              <div className="mt-5 border-t border-[var(--lp-border-light)] pt-4">
                <p className="mono text-[9px] uppercase tracking-[0.13em] text-[var(--lp-text-muted)]">Participants</p>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-[var(--lp-text-muted)]">Seller</span><br /><span className="font-semibold text-[var(--lp-dark)]">{shortAddress(props.seller)}</span></p>
                  <p><span className="text-[var(--lp-text-muted)]">Financier</span><br /><span className="font-semibold text-[var(--lp-dark)]">{shortAddress(props.financier)}</span></p>
                </div>
              </div>
            </section>

            <section className="border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-6" style={{ borderRadius: 16 }}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[var(--lp-dark)]">Deal progress</h2>
                <span className="text-xs font-medium text-[var(--lp-text-sub)]">{progress.label}</span>
              </div>
              <ol className="mt-5 space-y-4">
                {steps.map((step, index) => {
                  const complete = index + 1 <= progress.step;
                  return <li key={step} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: complete ? 'var(--lp-dark)' : 'transparent', color: complete ? 'white' : 'var(--lp-text-muted)', border: '1px solid var(--lp-border-light)' }}>{complete ? '✓' : index + 1}</span>
                    <div><p className="text-sm font-medium text-[var(--lp-dark)]">{step}</p>{index + 1 === progress.step && props.status === 'active' ? <p className="mt-0.5 text-xs text-[var(--lp-text-muted)]">Current stage</p> : null}</div>
                  </li>;
                })}
              </ol>
            </section>
          </div>

          <FinancingChatPanel kind={props.kind} positionId={props.positionId} seller={props.seller} financier={props.financier} />
        </div>
      </div>
    </main>
  );
}
