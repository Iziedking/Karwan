'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { DealView, DirectDeal, MoneyMovementView } from '@/core/api';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { Icon } from '@/shared/components/Icon';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { shortAddress } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { EditDealModal } from '../components/EditDealModal';
import { SettlementRecord, type SettlementRecordFetchState } from '../components/SettlementRecord';
import { AgreementSection } from './AgreementSection';
import { AnswerCancelSheet, AnswerTimeSheet, DeliverSheet, ProblemSheet, TurnDownSheet } from './DealSheets';
import { actionLabel, actorLabel, automaticLine, fill, formatDealDate, formatUsdcAmount, trustFactParts } from './presentation';
import { answersCancelHere, problemOptions } from './problems';
import { Sheet } from './Sheet';
import { TrustCard } from './TrustCard';
import { useChatUnread } from '@/features/chat/hooks/useChatUnread';

type Panel = 'record' | 'agreement' | 'messages' | 'receipts' | 'problem' | 'deliver' | 'answerTime' | 'answerCancel' | 'turnDown' | null;

const LINE_TONE: Record<DealView['money']['line'], string> = {
  'not-funded': 'var(--lp-text-sub)',
  held: 'var(--color-positive)',
  sending: 'var(--lp-text-sub)',
  paused: 'var(--color-warning)',
  released: 'var(--color-positive)',
  refunding: 'var(--lp-text-sub)',
  refunded: 'var(--lp-text-sub)',
};
const LINE_KEY = {
  'not-funded': 'notFunded', held: 'held', sending: 'sending', paused: 'paused',
  released: 'released', refunding: 'refunding', refunded: 'refunded',
} as const;

const isLink = (text: string) => /^https?:\/\/\S+$/i.test(text.trim());

/// One screen, one move: who it is with, the money and where it is, a line for
/// this moment, and the single thing to do. Everything else opens on request.
export function DealHero({ deal, view, address, viewerIsBuyer, displayName, busy, onPrimary, onChanged, movements, recordState, onRetryRecord }: {
  deal: DirectDeal;
  view: DealView;
  address: string | null;
  viewerIsBuyer: boolean;
  displayName: string;
  busy: boolean;
  onPrimary: () => void;
  onChanged: () => void;
  movements: MoneyMovementView[];
  recordState: SettlementRecordFetchState;
  onRetryRecord: () => void;
}) {
  const copy = useTranslations().dealWorkspace;
  const s = copy.simple;
  const declineCopy = useTranslations().directDealDetail.actionPanel.awaitingAcceptance;
  const { locale } = useLocale();
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const chat = useChatUnread(deal.jobId, address);
  const { markSeen } = chat;
  useEffect(() => {
    if (panel === 'messages' && chat.unread) markSeen();
  }, [panel, chat.unread, markSeen]);
  const [editing, setEditing] = useState(false);
  const viewer = !address ? null : viewerIsBuyer ? 'buyer' : 'seller';
  const counterparty = viewerIsBuyer ? deal.seller : deal.buyer;
  const card = deal.counterpartyTrust;
  const name = card?.name || shortAddress(counterparty);
  const facts = card ? (card.isNew ? s.newHere : trustFactParts(card, copy, locale).slice(0, 2).join(' · ')) : null;
  const problems = problemOptions(deal, viewer, Date.now());
  const isGoods = deal.tradeType === 'goods' || deal.tradeType === 'mixed';
  const declined = view.stage === 'awaiting-acceptance' && !!deal.sellerDeclinedAt;
  const label = actionLabel(view.next, copy, locale);
  const automatic = automaticLine(view, copy, locale);
  const close = () => setPanel(null);
  const done = () => {
    setPanel(null);
    onChanged();
  };

  function primary() {
    const action = view.next.action;
    if (action === 'deliver' && !isGoods) setPanel('deliver');
    else if (action === 'respond-extension') setPanel('answerTime');
    else if (action === 'respond-cancel' && answersCancelHere(deal)) setPanel('answerCancel');
    else if (action === 'dispute') setPanel('problem');
    else onPrimary();
  }

  let moment: ReactNode = null;
  const paused = deal.releaseBlockedReason && view.stage !== 'settled' && view.stage !== 'cancelled' ? copy.checkPaused : null;
  if (paused) {
    const detail = deal.releaseBlockedDetail;
    const reason = !detail
      ? paused.noWallet
      : !viewerIsBuyer && detail === 'security-hold'
        ? paused.sellerHold
        : !viewerIsBuyer && detail === 'off-request'
          ? paused.sellerOff
          : paused.reasons[detail];
    // The requirement review is the buyer's alone; the seller's copy of the deal never carries it.
    const saw = viewerIsBuyer ? deal.deliveryMatch?.reason?.trim() : undefined;
    moment = (
      <div role="status" className="space-y-2 rounded-[16px] border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] p-4">
        <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{paused.title}</p>
        <p className="text-[14px] leading-relaxed text-[var(--lp-dark)]">{reason}</p>
        {saw ? (
          <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]"><span className="font-semibold text-[var(--lp-dark)]">{paused.saw}:</span> <span dir="auto">{saw}</span></p>
        ) : null}
        <p className="text-[13px] text-[var(--lp-text-sub)]">{paused.stays}</p>
      </div>
    );
  } else if (declined && deal.sellerDeclineNote) {
    moment = (
      <div className="space-y-2">
        <p className="text-[15px] text-[var(--lp-dark)]">{viewerIsBuyer ? declineCopy.buyerDeclinedTitle : declineCopy.sellerDeclined}</p>
        <p dir="auto" className="rounded-[14px] bg-[var(--lp-card)] px-3.5 py-2.5 text-[15px] leading-relaxed text-[var(--lp-dark)]">{deal.sellerDeclineNote}</p>
      </div>
    );
  } else if (view.stage === 'awaiting-delivery' && deal.extensionRequest && !viewerIsBuyer) {
    moment = <p className="text-[15px] text-[var(--lp-dark)]">{fill(s.moreTimeSentTemplate, { name })}</p>;
  } else if (view.stage === 'awaiting-delivery' && deal.deadlineUnix) {
    const date = formatDealDate(deal.deadlineUnix * 1000, locale);
    moment = <p className="text-[15px] text-[var(--lp-dark)]">{viewerIsBuyer ? fill(s.buyerDueTemplate, { name, date }) : fill(s.sellerDueTemplate, { date })}</p>;
  } else if ((view.stage === 'awaiting-first-release' || view.stage === 'awaiting-final-release') && viewerIsBuyer && deal.delivered) {
    const proof = deal.deliveryProof?.trim();
    moment = (
      <p className="text-[15px] text-[var(--lp-dark)]">
        {fill(s.deliveredTemplate, { name })}{' '}
        {proof && isLink(proof) ? (
          <a href={proof} target="_blank" rel="noreferrer noopener" className="font-semibold underline underline-offset-4">{s.seeDelivery}</a>
        ) : null}
      </p>
    );
  }

  return (
    <div>
      <header className="flex items-center gap-3">
        <button type="button" onClick={() => setPanel('record')} disabled={!card} className="flex min-w-0 items-center gap-3 rounded-[14px] py-1 pe-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <PersonAvatar address={counterparty} name={name} />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-semibold text-[var(--lp-dark)]">{name}</span>
            {facts ? <span className="block truncate text-[13px] text-[var(--lp-text-sub)]">{facts}</span> : null}
          </span>
        </button>
      </header>

      <section aria-labelledby="deal-amount" className="pb-8 pt-10">
        <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--lp-text-sub)]">
          <span aria-hidden className="size-2 rounded-full" style={{ background: LINE_TONE[view.money.line] }} />
          {copy.money[LINE_KEY[view.money.line]]}
        </p>
        <h1 id="deal-amount" className="mt-3 flex items-baseline gap-2 tabular-nums">
          <span className="text-[56px] font-semibold leading-none tracking-[-0.04em] text-[var(--lp-dark)] sm:text-[72px]">{formatUsdcAmount(deal.dealAmountUsdc, locale)}</span>
          <span className="text-[18px] font-medium text-[var(--lp-text-sub)]">USDC</span>
        </h1>
        {moment ? <div className="mt-3 max-w-[52ch]">{moment}</div> : null}
        <ol aria-label={copy.progress.title} className="mt-6 flex gap-1.5">
          {view.progress.map((step) => (
            <li
              key={step.step}
              aria-label={`${copy.progress[step.step]}${step.state === 'done' ? ' ✓' : ''}`}
              aria-current={step.state === 'current' ? 'step' : undefined}
              className={cn(
                'h-1 flex-1 rounded-full',
                step.state === 'done' ? 'bg-[var(--lp-dark)]' : step.state === 'current' ? 'bg-[var(--accent)]' : 'bg-[var(--lp-border-light)]',
              )}
            />
          ))}
        </ol>
      </section>

      <div className="space-y-3 pb-6">
        {label ? (
          <button type="button" onClick={primary} disabled={busy} className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[16px] font-semibold text-[var(--on-action)] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2">
            {label}
          </button>
        ) : declined && viewerIsBuyer && address ? (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[16px] font-semibold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2">
            {declineCopy.editTermsCta}
          </button>
        ) : view.next.actor !== 'you' ? (
          <p className="flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--tint)] px-6 text-[15px] font-medium text-[var(--lp-text-sub)]">
            {actorLabel(view.next, displayName, copy)}
          </p>
        ) : null}
        {view.next.action === 'accept' && !deal.sellerDeclinedAt ? (
          <button type="button" onClick={() => setPanel('turnDown')} className="mx-auto flex min-h-11 items-center px-3 text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
            {s.turnDown}
          </button>
        ) : null}
        {automatic ? <p className="text-center text-[13px] text-[var(--lp-text-sub)]">{automatic}</p> : null}
      </div>

      <nav aria-label={copy.protectedDeal} className="overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
        {[
          ...(problems.length ? [{ key: 'problem' as const, text: s.problem }] : []),
          { key: 'agreement' as const, text: s.agreement },
          ...(address ? [{ key: 'messages' as const, text: s.messages }] : []),
          { key: 'receipts' as const, text: s.receipts },
        ].map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => setPanel(row.key)}
            className="flex min-h-14 w-full items-center justify-between border-b border-[var(--lp-border-light)] px-5 text-start text-[15px] font-medium text-[var(--lp-dark)] last:border-b-0 hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            <span className="inline-flex items-center gap-2.5">
              {row.text}
              {row.key === 'messages' && chat.unread ? (
                <span role="status" aria-label={s.newMessages} className="size-2 rounded-full bg-[var(--lp-accent)]" />
              ) : null}
            </span>
            <Icon name="chevron-right" size={16} directional className="text-[var(--lp-text-sub)]" />
          </button>
        ))}
      </nav>

      <Sheet open={panel === 'record'} title={s.record} onClose={close}>
        {card ? <TrustCard bare card={card} onOpenPassport={() => router.push(`/credit-passport/${counterparty}`)} /> : null}
      </Sheet>
      <Sheet open={panel === 'agreement'} title={s.agreement} onClose={close}>
        <AgreementSection bare deal={deal} />
      </Sheet>
      <Sheet open={panel === 'messages'} title={s.messages} onClose={close}>
        {address ? <ChatPanel jobId={deal.jobId} caller={address} counterpartyLabel={name} counterpartyAddress={counterparty} /> : null}
      </Sheet>
      <Sheet open={panel === 'receipts'} title={s.receipts} onClose={close}>
        <SettlementRecord
          movements={movements}
          fetchState={recordState}
          fundTxHash={deal.fundTxHash}
          refundTxHash={deal.refundTxHash}
          onRetry={onRetryRecord}
          canShareReceipts={viewerIsBuyer}
          dealAmountUsdc={deal.dealAmountUsdc}
          milestonePcts={deal.onChain?.milestonePcts?.length ? deal.onChain.milestonePcts : deal.milestonePcts?.length ? deal.milestonePcts : deal.firstReleasePct >= 100 ? [100] : [deal.firstReleasePct, 100 - deal.firstReleasePct]}
        />
      </Sheet>
      {address ? (
        <>
          <DeliverSheet open={panel === 'deliver'} deal={deal} caller={address} name={name} onClose={close} onDone={done} />
          <AnswerTimeSheet open={panel === 'answerTime'} deal={deal} caller={address} name={name} onClose={close} onDone={done} />
          <AnswerCancelSheet open={panel === 'answerCancel'} deal={deal} caller={address} name={name} onClose={close} onDone={done} />
          <TurnDownSheet open={panel === 'turnDown'} deal={deal} caller={address} name={name} onClose={close} onDone={done} />
          <ProblemSheet open={panel === 'problem'} deal={deal} caller={address} name={name} options={problems} onClose={close} onDone={done} />
        </>
      ) : null}
      {editing && address ? (
        <EditDealModal
          deal={deal}
          caller={address}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
