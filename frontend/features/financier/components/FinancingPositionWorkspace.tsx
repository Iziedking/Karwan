'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { DirectDeal } from '@/core/api';
import { ProductBackLink } from '@/shared/components/ProductBackLink';
import { useAuth } from '@/shared/hooks/useAuth';
import { Icon } from '@/shared/components/Icon';
import { Sheet } from '@/features/deals/workspace/Sheet';
import { FinancingChatPanel } from '@/features/chat/components/FinancingChatPanel';
import type { PositionStatus } from '../positionStatus';

type Status = PositionStatus;
type Copy = ReturnType<typeof useTranslations>['financingWorkspace'];

const STATUS_COPY: Record<Status, [keyof Copy, keyof Copy]> = {
  pending: ['statusPending', 'detailPending'],
  paySeller: ['statusPaySeller', 'detailPaySeller'],
  closed: ['statusClosed', 'detailClosed'],
  active: ['statusActive', 'detailActive'],
  repaid: ['statusRepaid', 'detailRepaid'],
  declined: ['statusDeclined', 'detailDeclined'],
  expired: ['statusExpired', 'detailExpired'],
  review: ['statusReview', 'detailReview'],
};

function dealProgress(deal: DirectDeal | null, status: Status): { label: keyof Copy; step: number } {
  if (!deal) return { label: 'progressUnavailable', step: 1 };
  // Nothing is paid out until the financier pays, whatever the deal has done.
  if (status === 'pending' || status === 'paySeller') return { label: 'progressAccepted', step: 1 };
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
  const fc = useTranslations().financingChat;
  const [messagesOpen, setMessagesOpen] = useState(false);
  const pathname = usePathname();
  const auth = useAuth();
  const [statusKey, detailKey] = STATUS_COPY[props.status];
  const progress = dealProgress(props.deal, props.status);
  const me = auth.address?.toLowerCase();
  const sellerName = me === props.seller.toLowerCase() ? fw.you : props.deal?.sellerPaytag ? `@${props.deal.sellerPaytag}` : fw.anySeller;
  const financierName = me === props.financier.toLowerCase() ? fw.you : fw.anyFinancier;
  const steps: (keyof Copy)[] = props.kind === 'po'
    ? ['stepPo1', 'stepPo2', 'stepPo3', 'stepPo4']
    : ['stepFactoring1', 'stepFactoring2', 'stepFactoring3', 'stepFactoring4'];
  const rows: [string, string][] = [
    [fw.amountFinanced, `${props.advanceUsdc} USDC`],
    [fw.expectedRepayment, `${props.expectedReturnUsdc} USDC`],
    ...(props.protectionUsdc ? [[fw.sellerProtectionReserved, `${props.protectionUsdc} USDC`] as [string, string]] : []),
    [fw.seller, sellerName],
    [fw.financier, financierName],
  ];

  return (
    <main className="product-surface mx-auto w-full max-w-[640px] px-4 pb-16 pt-4 sm:px-6">
      <div data-own-back className="-ms-2 mb-4 empty:hidden">
        <ProductBackLink pathname={pathname} isAuthenticated={auth.isAuthenticated} />
      </div>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[28px] font-semibold text-[var(--ink)]">{props.kind === 'po' ? fw.poTitle : fw.factoringTitle}</h1>
        <button
          type="button"
          onClick={() => setMessagesOpen(true)}
          aria-label={fc.privateConversation}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
        >
          <Icon name="messages" size={20} />
        </button>
      </div>
      <p className="mt-1 text-[15px] text-[var(--lp-text-sub)]">{fw.privateNote}</p>

      <p className="mt-6 text-[17px] font-medium text-[var(--ink)]">
        <span className={props.status === 'review' ? 'text-[var(--color-critical)]' : props.status === 'paySeller' ? 'text-[var(--warn)]' : ''}>{fw[statusKey]}</span>
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

      <Sheet open={messagesOpen} title={fc.privateConversation} onClose={() => setMessagesOpen(false)}>
        <FinancingChatPanel bare kind={props.kind} positionId={props.positionId} seller={props.seller} financier={props.financier} />
      </Sheet>
    </main>
  );
}
