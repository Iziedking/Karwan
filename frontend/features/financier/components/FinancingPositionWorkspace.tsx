'use client';

import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { DirectDeal } from '@/core/api';
import { BackButton } from '@/shared/components/BackButton';
import { FinancingChatPanel } from '@/features/chat/components/FinancingChatPanel';
import { shortAddress } from '@/shared/utils/format';

type Status = 'pending' | 'active' | 'repaid' | 'declined' | 'expired' | 'review';
type Copy = ReturnType<typeof useTranslations>['financingWorkspace'];

const STATUS_COPY: Record<Status, [keyof Copy, keyof Copy]> = {
  pending: ['statusPending', 'detailPending'],
  active: ['statusActive', 'detailActive'],
  repaid: ['statusRepaid', 'detailRepaid'],
  declined: ['statusDeclined', 'detailDeclined'],
  expired: ['statusExpired', 'detailExpired'],
  review: ['statusReview', 'detailReview'],
};

function dealProgress(deal: DirectDeal | null): { label: keyof Copy; step: number } {
  if (!deal) return { label: 'progressUnavailable', step: 1 };
  if (deal.settledAt) return { label: 'progressSettled', step: 4 };
  if (deal.disputed) return { label: 'progressReview', step: 3 };
  if (deal.delivered) return { label: 'progressDelivered', step: 3 };
  if (deal.fundTxHash) return { label: 'progressWorking', step: 2 };
  return { label: 'progressAccepted', step: 1 };
}

/// One financing position, private to its seller and financier: what was paid
/// out, what comes back first, where the deal is, and their conversation.
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
  const fw = useTranslations().financingWorkspace;
  const [statusKey, detailKey] = STATUS_COPY[props.status];
  const progress = dealProgress(props.deal);
  const steps: (keyof Copy)[] = props.kind === 'po'
    ? ['stepPo1', 'stepPo2', 'stepPo3', 'stepPo4']
    : ['stepFactoring1', 'stepFactoring2', 'stepFactoring3', 'stepFactoring4'];
  const rows: [string, string][] = [
    [fw.amountFinanced, `${props.advanceUsdc} USDC`],
    [fw.expectedRepayment, `${props.expectedReturnUsdc} USDC`],
    ...(props.protectionUsdc ? [[fw.sellerProtectionReserved, `${props.protectionUsdc} USDC`] as [string, string]] : []),
    [fw.seller, shortAddress(props.seller)],
    [fw.financier, shortAddress(props.financier)],
  ];

  return (
    <main className="product-surface mx-auto w-full max-w-[640px] px-4 pb-16 pt-4 sm:px-6">
      <div className="-ms-2 mb-4">
        <BackButton tone="adaptive" fallbackHref="/financier" />
      </div>

      <h1 className="text-[28px] font-semibold text-[var(--ink)]">{props.kind === 'po' ? fw.poTitle : fw.factoringTitle}</h1>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{fw.privateNote}</p>

      <p className="mt-6 text-[17px] font-medium text-[var(--ink)]">
        <span className={props.status === 'review' ? 'text-[var(--color-critical)]' : ''}>{fw[statusKey]}</span>
      </p>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{fw[detailKey]}</p>

      <dl className="mt-6 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-[15px] text-[var(--lp-text-sub)]">{label}</dt>
            <dd className="text-[15px] font-medium tabular-nums text-[var(--ink)]">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="financing-progress" className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="financing-progress" className="text-[17px] font-medium text-[var(--ink)]">{fw.dealProgress}</h2>
          <span className="text-[15px] text-[var(--lp-text-sub)]">{fw[progress.label]}</span>
        </div>
        <ol className="mt-4 space-y-3">
          {steps.map((step, index) => {
            const done = index + 1 < progress.step || (index + 1 === progress.step && progress.step === 4);
            const current = index + 1 === progress.step && !done;
            return (
              <li key={step} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
                    done ? 'bg-[var(--ink)] text-[var(--lp-bg)]' : current ? 'border-2 border-[var(--ink)] text-[var(--ink)]' : 'border border-[var(--line)] text-[var(--lp-text-sub)]'
                  }`}
                >
                  {done ? '✓' : index + 1}
                </span>
                <span className={`text-[15px] ${done || current ? 'font-medium text-[var(--ink)]' : 'text-[var(--lp-text-sub)]'}`}>{fw[step]}</span>
                {current ? <span className="sr-only">{fw.currentStage}</span> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-8">
        <FinancingChatPanel kind={props.kind} positionId={props.positionId} seller={props.seller} financier={props.financier} />
      </div>
    </main>
  );
}
