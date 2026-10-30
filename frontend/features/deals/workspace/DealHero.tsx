'use client';
import { useEffect, useState, type ReactNode } from 'react';
import type { DealView, DirectDeal, MoneyMovementView } from '@/core/api';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { Icon } from '@/shared/components/Icon';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { shortAddress } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { EditDealModal } from '../components/EditDealModal';
import { dealReference } from '../dealReference';
import { SettlementRecord, type SettlementRecordFetchState } from '../components/SettlementRecord';
import { AgreementSection } from './AgreementSection';
import { AnswerCancelSheet, AnswerTimeSheet, DeliverSheet, ProblemSheet, TurnDownSheet } from './DealSheets';
import { actionLabel, actorLabel, automaticLine, fill, formatDealDate, formatUsdcAmount, heldMove, trustFactParts } from './presentation';
import { callPerson } from '@/shared/assistant/openHelp';
import { answersCancelHere, problemOptions } from './problems';
import { deliveryCheckStatus, heldDetailOf } from './checkStatus';
import { Sheet } from './Sheet';
import { TrustCard } from './TrustCard';
import { useChatUnread } from '@/features/chat/hooks/useChatUnread';
import { DealLatest, DealTimeline } from './DealTimeline';
import { DisputePanel } from './DisputePanel';
import { DeliveryCard } from './DeliveryCard';
import { HandoverCode } from './HandoverCode';
import { RecordNudge } from './RecordNudge';
import { deliveryNeedsShipment } from './delivery';
import { linksIn } from './deliveryCard';

type Panel = 'record' | 'agreement' | 'messages' | 'receipts' | 'problem' | 'deliver' | 'answerTime' | 'answerCancel' | 'turnDown' | null;

const LINE_TONE: Record<DealView['money']['line'], string> = {
  'not-funded': 'var(--lp-text-sub)',
  held: 'var(--color-positive)',
  sending: 'var(--lp-text-sub)',
  paused: 'var(--color-warning)',
  released: 'var(--color-positive)',
  refunding: 'var(--lp-text-sub)',
  refunded: 'var(--lp-text-sub)',
  cancelled: 'var(--lp-text-sub)',
};
const LINE_KEY = {
  'not-funded': 'notFunded', held: 'held', sending: 'sending', paused: 'paused',
  released: 'released', refunding: 'refunding', refunded: 'refunded', cancelled: 'cancelled',
} as const;

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
  const dl = useTranslations().dealLive;
  const s = copy.simple;
  const declineCopy = useTranslations().directDealDetail.actionPanel.awaitingAcceptance;
  const { locale } = useLocale();
  const [panel, setPanel] = useState<Panel>(null);
  const chat = useChatUnread(deal.jobId, address);
  const { markSeen } = chat;
  useEffect(() => {
    if (panel === 'messages' && chat.unread) markSeen();
  }, [panel, chat.unread, markSeen]);
  const [editing, setEditing] = useState(false);
  // The short reference people give the assistant or support (view 42).
  const reference = dealReference(deal.jobId);
  const [copied, setCopied] = useState(false);
  async function copyReference() {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The reference stays visible and selectable without clipboard access.
    }
  }
  const viewer = !address ? null : viewerIsBuyer ? 'buyer' : 'seller';
  const counterparty = viewerIsBuyer ? deal.seller : deal.buyer;
  const card = deal.counterpartyTrust;
  const name = card?.name || shortAddress(counterparty);
  const facts = card ? (card.isNew ? s.newHere : trustFactParts(card, copy, locale).slice(0, 2).join(' · ')) : null;
  const problems = problemOptions(deal, viewer, Date.now());
  const declined = view.stage === 'awaiting-acceptance' && !!deal.sellerDeclinedAt;
  const label = actionLabel(view.next, copy, locale);
  const automatic = automaticLine(view, copy, locale, viewerIsBuyer ? dl : undefined);
  const close = () => setPanel(null);
  const done = () => {
    setPanel(null);
    onChanged();
  };

  function primary() {
    const action = view.next.action;
    if (action === 'deliver') setPanel('deliver');
    else if (action === 'respond-extension') setPanel('answerTime');
    else if (action === 'respond-cancel' && answersCancelHere(deal)) setPanel('answerCancel');
    else if (action === 'dispute') setPanel('problem');
    else onPrimary();
  }

  let moment: ReactNode = null;
  const check = deliveryCheckStatus(deal, view.stage);
  const live = copy.checkLive;
  const paused = check === 'held' ? copy.checkPaused : null;
  // A hold from the verdict shows at once, before the watcher records a detail.
  const heldDetail = paused ? heldDetailOf(deal) : undefined;
  const held = paused ? heldMove(heldDetail, viewerIsBuyer) : null;
  const yourMove = !!address && (held === 'redeliver' || (!held && !!label) || (declined && viewerIsBuyer));
  const review = deal.deliveryReviewState?.state;
  const askPerson = () => callPerson([], { message: fill(copy.checkPaused.supportMessage, { path: `/deals/${deal.jobId}` }), dealId: deal.jobId });
  // The first link in the seller's note, wherever it sits in the sentence; the Delivery card lists them all.
  const firstLink = viewerIsBuyer ? linksIn(deal.deliveryProof)[0]?.url : undefined;
  const seeDelivery = firstLink ? (
    <a href={firstLink} target="_blank" rel="noreferrer noopener" className="font-semibold underline underline-offset-4">{s.seeDelivery}</a>
  ) : null;
  if (paused) {
    const detail = heldDetail;
    const reason = !detail
      ? paused.noWallet
      : !viewerIsBuyer && detail === 'security-hold' && review === 'unsafe'
        ? paused.reviewUnsafe
      : !viewerIsBuyer && detail === 'security-hold' && review === 'checking'
        ? paused.reviewChecking
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
          <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium"><span className="font-semibold text-[var(--lp-dark)]">{paused.saw}:</span> <span dir="auto">{saw}</span></p>
        ) : null}
        <p className="text-[14px] text-[var(--lp-text-sub)] font-medium">{paused.stays}</p>
      </div>
    );
  } else if (check === 'checking') {
    moment = (
      <div role="status" aria-live="polite" className="flex gap-3 rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4">
        <span aria-hidden className="relative mt-1.5 flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full rounded-full bg-[var(--accent)] opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2.5 rounded-full bg-[var(--accent)]" />
        </span>
        <span className="space-y-1">
          <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{live.checking}</span>
          <span className="block text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{live.checkingBody}</span>
        </span>
      </div>
    );
  } else if (check === 'passed' || check === 'unverified') {
    const passed = check === 'passed';
    moment = (
      <div role="status" className="flex gap-3 rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-4">
        <span aria-hidden className={cn('mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full', passed ? 'bg-[var(--accent)]' : 'bg-[var(--color-warning-soft)]')}>
          {passed ? (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--lp-band-dark)]"><path d="M2.5 6.3 5 8.7l4.6-5.2" /></svg>
          ) : (
            <span className="size-1.5 rounded-full bg-[var(--color-warning)]" />
          )}
        </span>
        <span className="space-y-1">
          <span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{passed ? live.passed : live.unverified}</span>
          <span className="block text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
            {viewerIsBuyer
              ? passed ? live.passedBuyer : live.unverifiedBuyer
              : fill(passed ? live.passedSeller : live.unverifiedSeller, { name })}{' '}
            {review === 'safe' ? `${copy.checkPaused.reviewedSafe} ` : null}
            {seeDelivery}
          </span>
        </span>
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
  } else if ((view.stage === 'awaiting-first-release' || view.stage === 'awaiting-final-release') && viewerIsBuyer && deal.delivered) {
    moment = (
      <p className="text-[15px] text-[var(--lp-dark)]">
        {fill(s.deliveredTemplate, { name })}{' '}
        {seeDelivery}
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <div className="min-w-0 space-y-4">
      <section aria-labelledby="deal-amount" className="rounded-[24px] border border-[var(--lp-border-light)] bg-[linear-gradient(115deg,var(--hero-from),var(--hero-to)_70%)] p-5 shadow-[var(--hero-shadow)] sm:p-6">
      <header className="flex items-center gap-3">
        <button type="button" onClick={() => setPanel('record')} disabled={!card} className="flex min-w-0 items-center gap-3 rounded-[14px] py-1 pe-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
          <PersonAvatar address={counterparty} name={name} />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-semibold text-[var(--lp-dark)]">{name}</span>
            {facts ? <span className="block truncate text-[14px] text-[var(--lp-text-sub)] font-medium">{facts}</span> : null}
          </span>
        </button>
        {address ? (
          <button
            type="button"
            onClick={() => setPanel('messages')}
            aria-label={fill(dl.message, { name })}
            className="relative ms-auto grid size-11 shrink-0 place-items-center rounded-full border border-[var(--lp-border-light)] text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Icon name="messages" size={20} />
            {chat.unread ? (
              <span role="status" aria-label={s.newMessages} className="absolute end-2 top-2 size-2.5 rounded-full border-2 border-[var(--lp-light)] bg-[var(--lp-accent)]" />
            ) : null}
          </button>
        ) : null}
      </header>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--lp-text-sub)]">
            <span aria-hidden className="size-2 rounded-full" style={{ background: LINE_TONE[view.money.line] }} />
            {copy.money[LINE_KEY[view.money.line]]}
          </p>
          {reference ? (
            <button
              type="button"
              onClick={copyReference}
              aria-label={copied ? copy.reference.copied : fill(copy.reference.copy, { reference })}
              className="-me-2 inline-flex min-h-11 items-center gap-2 rounded-[10px] px-2 mono text-[13px] tracking-[0.04em] text-[var(--lp-text-sub)] transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <span dir="ltr">{fill(copy.reference.label, { reference })}</span>
              <Icon name={copied ? 'check' : 'copy'} size={16} className="shrink-0" />
            </button>
          ) : null}
        </div>
        <h1 id="deal-amount" className="mt-2 flex items-baseline gap-2 tabular-nums">
          <span className="text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--lp-dark)] sm:text-[40px]">{formatUsdcAmount(deal.dealAmountUsdc, locale)}</span>{' '}
          {' '}<span className="text-[15px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
        </h1>
        {moment ? <div className="mt-3 max-w-[52ch]">{moment}</div> : null}
      </section>

      <div className={cn('space-y-3 empty:hidden', yourMove && 'rounded-[20px] border border-[color-mix(in_srgb,var(--lp-accent)_45%,transparent)] bg-[var(--lp-card)] p-5')}>
        {yourMove ? <p className="text-[13px] font-bold text-[var(--lp-accent-on-light)]">{copy.actor.you}</p> : null}
        {held === 'redeliver' && address ? (
          <>
            <button type="button" onClick={() => setPanel('deliver')} disabled={busy} className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[16px] font-semibold text-[var(--on-action)] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2">
              {copy.checkPaused.sendNewLink}
            </button>
            {review ? null : <button type="button" onClick={askPerson} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--lp-border-light)] px-6 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              <Icon name="user" size={20} />
              {copy.checkPaused.askPerson}
            </button>}
          </>
        ) : held === 'wait-seller' ? (
          <p className="flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--tint)] px-6 text-[15px] font-medium text-[var(--lp-text-sub)]">
            {fill(copy.actor.waitingTemplate, { name })}
          </p>
        ) : label ? (
          <button type="button" onClick={primary} disabled={busy} className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[16px] font-semibold text-[var(--on-action)] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2">
            {label}
          </button>
        ) : declined && viewerIsBuyer && address ? (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[16px] font-semibold text-[var(--on-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2">
            {declineCopy.editTermsCta}
          </button>
        ) : view.next.actor !== 'you' && view.stage !== 'settled' && view.stage !== 'cancelled' ? (
          // Whose move it is, as a plain line: a filled pill read as a button
          // nobody could press. A finished deal needs no line at all.
          <p className="flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-[var(--lp-text-sub)]">
            {check === 'checking' ? live.checking : actorLabel(view.next, displayName, copy)}
          </p>
        ) : null}
        {view.next.action === 'accept' && !deal.sellerDeclinedAt ? (
          <button type="button" onClick={() => setPanel('turnDown')} className="mx-auto flex min-h-11 items-center px-3 text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4">
            {s.turnDown}
          </button>
        ) : null}
        {view.stage === 'settled' && viewerIsBuyer && address ? (
          <a
            href={`/buyer?seller=${deal.seller}`}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-[var(--action)] px-6 text-[16px] font-semibold text-[var(--on-action)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2"
          >
            {fill(dl.again, { name })}
          </a>
        ) : null}
        {automatic ? <p className="text-center text-[14px] text-[var(--lp-text-sub)] font-medium">{automatic}</p> : null}
      </div>
      {deal.dispute && address ? (
        <DisputePanel jobId={deal.jobId} dispute={deal.dispute} viewerIsBuyer={viewerIsBuyer} caller={address} name={name} myName={displayName} onChanged={onChanged} />
      ) : null}
      </div>

      <div className="min-w-0 space-y-4">
      <section className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-5 py-4 [&>ol]:mt-0">
        <DealTimeline
          progress={view.progress}
          viewerIsBuyer={viewerIsBuyer}
          name={name}
          check={check}
          dueAt={deal.deadlineUnix ? deal.deadlineUnix * 1000 : null}
        />
      </section>
      <DeliveryCard deal={deal} viewerIsBuyer={viewerIsBuyer} caller={address} onChanged={onChanged} />
      {viewerIsBuyer && address && deliveryNeedsShipment(deal.tradeType) && view.stage === 'awaiting-delivery' && !deal.shipment?.arrivedAt ? (
        <HandoverCode jobId={deal.jobId} caller={address} />
      ) : null}
        {view.stage === 'settled' ? (
          <div className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
            <p className="flex items-center gap-2 text-[16px] font-semibold text-[var(--lp-dark)]">
              <Icon name="check" size={20} className="text-[var(--color-positive)]" />
              {view.onBothRecords ? dl.onBothRecords : dl.completeTitle}
            </p>
            {view.onBothRecords || view.onBothRecords === null ? null : (
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
                {view.onBothRecords === false ? dl.recordPending : dl.completeBody}
              </p>
            )}
            {view.recordNudge ? <RecordNudge /> : null}
          </div>
        ) : null}

      {address ? <DealLatest jobId={deal.jobId} caller={address} name={name} onOpen={() => setPanel('messages')} /> : null}

      <nav aria-label={copy.protectedDeal} className="overflow-hidden rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
        {[
          ...(problems.length ? [{ key: 'problem' as const, text: s.problem }] : []),
          { key: 'agreement' as const, text: s.agreement },
          { key: 'receipts' as const, text: s.receipts },
        ].map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => setPanel(row.key)}
            className="flex min-h-14 w-full items-center justify-between border-b border-[var(--lp-border-light)] px-5 text-start text-[15px] font-medium text-[var(--lp-dark)] last:border-b-0 hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            <span>{row.text}</span>
            <Icon name="chevron-right" size={16} directional className="text-[var(--lp-text-sub)]" />
          </button>
        ))}
      </nav>
      </div>

      <Sheet open={panel === 'record'} title={s.record} onClose={close}>
        {card ? <TrustCard bare card={card} onOpenPassport={() => window.open(`/credit-passport/${counterparty}`, '_blank', 'noopener,noreferrer')} /> : null}
      </Sheet>
      <Sheet open={panel === 'agreement'} title={s.agreement} onClose={close}>
        <AgreementSection bare deal={deal} />
      </Sheet>
      <Sheet open={panel === 'messages'} title={s.messages} onClose={close}>
        {address ? <ChatPanel jobId={deal.jobId} caller={address} counterpartyLabel={name} counterpartyAddress={counterparty} /> : null}
      </Sheet>
      <Sheet open={panel === 'receipts'} title={s.receipts} onClose={close}>
        <SettlementRecord
          bare
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
