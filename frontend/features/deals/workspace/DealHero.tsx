'use client';
import { Price } from '@/features/money/components/Price';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api, type DealView, type DirectDeal, type MoneyMovementView } from '@/core/api';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { Icon } from '@/shared/components/Icon';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { shortAddress } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import { EditDealModal } from '../components/EditDealModal';
import { dealReference } from '../dealReference';
import { dealLayers, type LayerKey } from './dealLayers';
import { GetPaidNow } from './GetPaidNow';
import { financingVisible } from '@/shared/deals/financingEligibility';
import { SettlementRecord, type SettlementRecordFetchState } from '../components/SettlementRecord';
import { AgreementSection } from './AgreementSection';
import { AnswerCancelSheet, AnswerTimeSheet, DeliverSheet, ProblemSheet, TurnDownSheet } from './DealSheets';
import { actionLabel, actorLabel, automaticLine, fill, formatDealDate, formatUsdcAmount, heldMove, trustFactParts } from './presentation';
import { callPerson } from '@/shared/assistant/openHelp';
import { answersCancelHere, problemOptions, proposalOutcome } from './problems';
import { findUnresolvedPayoutRecovery } from '../moneyRecovery';
import { deliveryCheckStatus, heldDetailOf } from './checkStatus';
import { Sheet } from './Sheet';
import { TrustCard } from './TrustCard';
import { useChatUnread } from '@/features/chat/hooks/useChatUnread';
import { DealLatest, DealTimeline } from './DealTimeline';
import { DisputePanel } from './DisputePanel';
import { DeliveryCard } from './DeliveryCard';
import { BuyerPodPanel } from '@/features/trade/components/BuyerPodPanel';
import { HandoverCode } from './HandoverCode';
import { RecordNudge } from './RecordNudge';
import { deliveryNeedsShipment } from './delivery';
import { linksIn } from './deliveryCard';
import { DealMoment } from './DealMoment';
import { dealKindOf, moneySplit } from './dealSteps';
import { DealRoute } from '../DealRoute';
import { Button, buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { FactRows } from '@/shared/components/FactRows';
import { checkSummary } from './checkSummary';
import { wrongChoices } from './wrongChoices';
import { CheckedCard } from './CheckedCard';
import { CheckNotRun } from './CheckNotRun';
import { titleMoneyLine, whatItIs } from './titleLine';
import { momentFor } from './momentLine';

const PRIMARY_CLASS = buttonClasses({ variant: 'primary', size: 'lg', className: 'w-full' });
const SECONDARY_CLASS = buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' });

type Panel = 'record' | 'messages' | 'problem' | 'deliver' | 'answerTime' | 'answerCancel' | 'turnDown' | null;

/// What the seller received: the escrow's net, else the deal amount.
function sellerNetUsdc(deal: DirectDeal): string {
  const wei = deal.onChain?.sellerNetWei;
  if (!wei) return deal.dealAmountUsdc;
  const micros = BigInt(wei);
  return `${micros / 1_000_000n}.${(micros % 1_000_000n).toString().padStart(6, '0')}`;
}

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
  const dp = useTranslations().dealPage;
  const dl = useTranslations().dealLive;
  const s = copy.simple;
  const dd = useTranslations().directDealDetail;
  const declineCopy = dd.actionPanel.awaitingAcceptance;
  const { locale } = useLocale();
  const [panel, setPanel] = useState<Panel>(null);
  // One row under the title block is open at a time (view 43).
  const [openRow, setOpenRow] = useState<LayerKey | null>(null);
  const chat = useChatUnread(deal.jobId, address);
  const { markSeen } = chat;
  useEffect(() => {
    if (panel === 'messages' && chat.unread) markSeen();
  }, [panel, chat.unread, markSeen]);
  // Messages open beside the deal from the message button, not as a row.
  const openMessages = () => setPanel('messages');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ text: string; key: number } | null>(null);
  // A finished deal: the seller sees what was paid, their balance and the rating they received.
  const settledParty = view.stage === 'settled' && !!address;
  const rating = useQuery({
    queryKey: ['deal-rating', deal.jobId],
    queryFn: () => api.dealRating(deal.jobId),
    enabled: settledParty && !viewerIsBuyer,
    retry: false,
  });
  const money = useMoneyBalances();
  const { profile } = useUserProfile();
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
  // "with {name}" in each language, with only the name as the button to their record.
  const [withBefore, withAfter = ''] = dp.withName.split('{name}');
  const problems = problemOptions(deal, viewer, Date.now());
  const declined = view.stage === 'awaiting-acceptance' && !!deal.sellerDeclinedAt;
  // A deal on an older contract finishes in Earlier deals; this page only says so.
  const legacy = !!deal.legacyEscrow;
  const outcome = proposalOutcome(deal);
  const label = legacy
    ? null
    : view.next.action === 'respond-cancel' && (outcome === 'refund' || outcome === 'pay')
      ? dp.answerProposal
      : actionLabel(view.next, copy, locale);
  // A payout that may already be on chain is checked again before anything new moves.
  const recovery = address && (view.stage === 'awaiting-first-release' || view.stage === 'awaiting-final-release')
    ? findUnresolvedPayoutRecovery(movements)
    : undefined;
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  async function checkAgain(reference: string) {
    if (!address) return;
    setChecking(true);
    setCheckError(null);
    try {
      await api.reconcileDirectDealPayout(deal.jobId, reference, address);
      onChanged();
    } catch (err) {
      setCheckError(err instanceof ApiError && err.detail ? String(err.detail) : (err as Error).message);
    } finally {
      setChecking(false);
    }
  }
  const automatic = automaticLine(view, copy, locale, viewerIsBuyer ? dl : undefined);
  const momentNow = address ? momentFor(view, name, dp, view.next.amountUsdc ? formatUsdcAmount(view.next.amountUsdc, locale) : '') : null;
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
  const summary = checkSummary(deal, viewerIsBuyer, dealKindOf(deal));
  // A delivery that does not match what was agreed: the buyer asks for changes.
  const askForChanges = !!address && viewerIsBuyer && summary?.result === 'gap';
  const review = deal.deliveryReviewState?.state;
  const askPerson = () => callPerson([], { message: fill(copy.checkPaused.supportMessage, { path: `/deals/${deal.jobId}` }), dealId: deal.jobId });
  // The first link in the seller's note, wherever it sits in the sentence; the Delivery card lists them all.
  const firstLink = viewerIsBuyer ? linksIn(deal.deliveryProof)[0]?.url : undefined;
  const seeDelivery = firstLink ? (
    <a href={firstLink} target="_blank" rel="noreferrer noopener" className="font-semibold underline underline-offset-4">{s.seeDelivery}</a>
  ) : null;
  if (legacy) {
    moment = (
      <div data-earlier-escrow className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-[var(--lp-dark)]">{dp.earlierEscrow}</p>
        <Link href="/legacy" className="inline-flex min-h-11 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">{dp.openEarlier}</Link>
      </div>
    );
  } else if (recovery) {
    moment = (
      <div className="space-y-1">
        <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{dd.settlementRecord.recoveryTitle}</p>
        <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{dd.settlementRecord.recoveryBody}</p>
        {checkError ? <p role="alert" className="border-s-2 border-[var(--color-critical)] ps-3 text-[14px] text-[var(--lp-dark)]">{checkError}</p> : null}
      </div>
    );
  } else if (summary && paused) {
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
    moment = (
      <CheckedCard summary={summary}>
        <p className="text-[14px] leading-relaxed text-[var(--lp-dark)]">{reason}</p>
        <p className="text-[14px] text-[var(--lp-text-sub)] font-medium">{paused.stays}</p>
      </CheckedCard>
    );
  } else if (summary) {
    moment = (
      <CheckedCard summary={summary}>
        {summary.result === 'unverified' ? (
          <CheckNotRun jobId={deal.jobId} viewerIsBuyer={viewerIsBuyer} caller={address ?? null} onChanged={onChanged} />
        ) : null}
        {review === 'safe' || seeDelivery ? (
          <p className="text-[14px] text-[var(--lp-text-sub)] font-medium">
            {review === 'safe' ? `${copy.checkPaused.reviewedSafe} ` : null}
            {seeDelivery}
          </p>
        ) : null}
      </CheckedCard>
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

  const isSeller = !!address && deal.seller.toLowerCase() === address.toLowerCase();
  const layers = dealLayers({
    delivered: !!deal.delivered || !!deal.deliveredAt,
    needsHandover: viewerIsBuyer && !!address && deliveryNeedsShipment(deal.tradeType) && view.stage === 'awaiting-delivery' && !deal.shipment?.arrivedAt,
    canGetPaid: financingVisible(deal, isSeller) && deal.escrowVersion === 'suite',
    funded: !!deal.acceptedAt || !!deal.fundTxHash,
    problems: problems.length,
    heldDelivery: check === 'held',
  });
  const steps = copy.progress;
  const current = view.progress.find((p) => p.state === 'current') ?? [...view.progress].reverse().find((p) => p.state === 'done');
  const rowTitle: Record<LayerKey, string> = {
    progress: steps.title,
    delivery: copy.layers.delivery,
    handover: copy.layers.handover,
    getPaid: copy.layers.getPaid,
    agreement: s.agreement,
    receipts: s.receipts,
    problem: s.problem,
  };
  const rowSummary: Partial<Record<LayerKey, string>> = {
    progress: current ? steps[current.step] : undefined,
    delivery: paused ? paused.title : deal.deliveredAt ? formatDealDate(deal.deliveredAt, locale) : undefined,
    agreement: deal.terms,
  };
  function rowBody(key: LayerKey): ReactNode {
    switch (key) {
      case 'progress':
        return (
          <div className="space-y-6 [&>ol]:mt-0">
            <DealTimeline progress={view.progress} viewerIsBuyer={viewerIsBuyer} name={name} check={check} dueAt={deal.deadlineUnix ? deal.deadlineUnix * 1000 : null} />
            {address ? <DealLatest jobId={deal.jobId} caller={address} name={name} onOpen={openMessages} /> : null}
          </div>
        );
      case 'delivery':
        return (
          <div className="space-y-5">
            <DeliveryCard deal={deal} viewerIsBuyer={viewerIsBuyer} caller={address} onChanged={onChanged} />
            {/* A financed goods order: the buyer confirms the goods on the trade record, which frees the advance to the seller. */}
            <BuyerPodPanel deal={deal} viewerIsBuyer={viewerIsBuyer} onPodAccepted={onChanged} />
          </div>
        );
      case 'handover':
        return address ? <HandoverCode jobId={deal.jobId} caller={address} /> : null;
      case 'getPaid':
        return <GetPaidNow deal={deal} viewerIsSeller={isSeller} onChanged={onChanged} />;
      case 'agreement':
        return <AgreementSection bare deal={deal} />;
      case 'receipts':
        return (
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
        );
      default:
        return null;
    }
  }

  const settled = view.stage === 'settled';
  const what = whatItIs(deal);
  const amount = formatUsdcAmount(deal.dealAmountUsdc, locale);
  const moneyLine = titleMoneyLine(deal, name, dp, locale) ?? copy.money[LINE_KEY[view.money.line]];
  const canProblem = !!address && problems.length > 0;
  const referenceButton = reference ? (
    <button
      type="button"
      onClick={copyReference}
      aria-label={copied ? copy.reference.copied : fill(copy.reference.copy, { reference })}
      className="-me-2 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-[13px] tabular-nums text-[var(--ink-secondary)] transition-colors hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
    >
      <span dir="ltr">{fill(copy.reference.label, { reference })}</span>
      <Icon name={copied ? 'check' : 'copy'} size={16} className="shrink-0" />
    </button>
  ) : null;

  // The move is pinned above the tab bar on phones and sits inside the money card on desktop.
  const moveBar = (
  <div
    data-move-bar
    className={settled
      // A finished deal has no move to pin: what is left sits in the page.
      ? 'space-y-2 empty:hidden'
      : 'fixed inset-x-0 bottom-[calc(61px+max(8px,env(safe-area-inset-bottom)))] z-30 space-y-2 border-t border-[var(--line)] bg-[var(--canvas)] px-4 py-3 empty:hidden lg:static lg:z-auto lg:space-y-3 lg:border-0 lg:bg-transparent lg:p-0'}
  >
    {!settled && automatic ? <p className="text-[13px] text-[var(--ink-secondary)]">{automatic}</p> : null}
    {legacy || settled ? null : recovery ? (
      <Button type="button" size="lg" className="w-full" onClick={() => void checkAgain(recovery.reference)} loading={checking} loadingLabel={dd.settlementRecord.reconcileBusy}>
        {dp.checkAgain}
      </Button>
    ) : askForChanges ? (
      <button type="button" onClick={() => { setDraft({ text: dp.changesDraft, key: Date.now() }); openMessages(); }} className={PRIMARY_CLASS}>
        {dp.askChanges}
      </button>
    ) : held === 'redeliver' && address ? (
      <>
        <button type="button" onClick={() => setPanel('deliver')} disabled={busy} className={PRIMARY_CLASS}>
          {copy.checkPaused.sendNewLink}
        </button>
        {review ? null : <button type="button" onClick={askPerson} className={SECONDARY_CLASS}>
          <Icon name="user" size={20} />
          {copy.checkPaused.askPerson}
        </button>}
      </>
    ) : held === 'wait-seller' ? (
      <p className="flex min-h-[52px] w-full items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface)] px-6 text-[15px] font-medium text-[var(--ink-secondary)]">
        {fill(copy.actor.waitingTemplate, { name })}
      </p>
    ) : label ? (
      <button type="button" onClick={primary} disabled={busy} className={PRIMARY_CLASS}>
        {label}
      </button>
    ) : declined && viewerIsBuyer && address ? (
      <button type="button" onClick={() => setEditing(true)} className={PRIMARY_CLASS}>
        {declineCopy.editTermsCta}
      </button>
    ) : !momentNow && view.next.actor !== 'you' && view.stage !== 'cancelled' ? (
      // Whose move it is, as a plain line: a filled pill read as a button
      // nobody could press.
      <p className="flex min-h-11 w-full items-center justify-center text-[15px] font-medium text-[var(--ink-secondary)]">
        {check === 'checking' ? live.checking : actorLabel(view.next, displayName, copy)}
      </p>
    ) : null}
    {!settled && canProblem ? (
      <button type="button" onClick={() => setPanel('problem')} className={SECONDARY_CLASS}>
        {s.problem}
      </button>
    ) : null}
    {view.next.action === 'accept' && !deal.sellerDeclinedAt ? (
      <button type="button" onClick={() => setPanel('turnDown')} className="mx-auto flex min-h-11 items-center px-3 text-[14px] font-semibold text-[var(--ink)] underline underline-offset-4">
        {s.turnDown}
      </button>
    ) : null}
    {settled && viewerIsBuyer && address ? (
      <a href={`/buyer?seller=${deal.seller}`} className={SECONDARY_CLASS}>
        {fill(dl.again, { name })}
      </a>
    ) : null}
  </div>
  );

  return (
    <div className="mx-auto max-w-[640px]">
      <div className="min-w-0 space-y-5">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {what ? <p dir="auto" className="truncate text-[13px] text-[var(--ink-secondary)]">{what}</p> : null}
            <p className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[13px] text-[var(--ink-secondary)]">
              <span className="min-w-0">
                {withBefore}
                <button type="button" onClick={() => setPanel('record')} disabled={!card} className="rounded-[6px] font-medium text-[var(--ink)] enabled:hover:underline enabled:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
                  {name}
                </button>
                {withAfter}
              </span>
            </p>
            {facts ? <p className="mt-0.5 truncate text-[13px] text-[var(--ink-muted)]">{facts}</p> : null}
          </div>
        {address ? (
          <button
            type="button"
            onClick={openMessages}
            aria-label={fill(dl.message, { name })}
            className="relative grid size-11 shrink-0 place-items-center rounded-full text-[var(--ink)] hover:bg-[var(--raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          >
            <Icon name="messages" size={20} />
            {chat.unread ? (
              <span role="status" aria-label={s.newMessages} className="absolute end-2 top-2 size-2.5 rounded-full border-2 border-[var(--canvas)] bg-[var(--ink)]" />
            ) : null}
          </button>
        ) : null}
        </div>
        {!settled && momentNow ? (
          <DealMoment label={momentNow.label} yours={view.next.actor === 'you'} sentence={momentNow.sentence} automatic={null} />
        ) : null}
      </header>

      {settled ? (
        <section data-deal-done className="space-y-5">
          <span aria-hidden className="grid size-14 place-items-center rounded-full bg-[var(--ash)] text-[var(--ink)]">
            <Icon name="check" size={24} />
          </span>
          {settledParty && !viewerIsBuyer ? (
            <div data-seller-paid>
              <h1 id="deal-amount" className="text-[28px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--ink)]">{fill(dp.paidYou, { amount: formatUsdcAmount(sellerNetUsdc(deal), locale) })}</h1>
              <p className="mt-1 text-[15px] text-[var(--ink-secondary)]">
                {dp.inBalance}{money.balance !== null ? ` · ${formatUsdcAmount(String(money.balance), locale)} USDC` : ''}
              </p>
              {rating.data?.received ? (
                <div className="mt-3">
                  <p className="text-[15px] font-semibold text-[var(--ink)]">{fill(dp.ratedYou, { name, stars: rating.data.received.stars })}</p>
                  {rating.data.received.note ? <p dir="auto" className="mt-0.5 text-[14px] text-[var(--ink-secondary)]">{rating.data.received.note}</p> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <h1 id="deal-amount" className="text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] text-[var(--ink)]">
                {viewerIsBuyer ? fill(dp.paidTitle, { name }) : dp.doneTitle}
              </h1>
              <p dir="auto" className="mt-1 text-[15px] text-[var(--ink-secondary)]">{amount} USDC{what ? ` · ${what}` : ''}</p>
            </div>
          )}
          <div className={`${CARD_CLASS} p-5 lg:p-6`}>
            <DealRoute deal={deal} />
            <div className="mt-5 border-t border-[var(--line)] pt-1">
              <FactRows facts={[
                ...(deal.settledAt ? [{ label: dp.stageLine.paidOut, value: formatDealDate(deal.settledAt, locale) }] : []),
                { label: dp.amount, value: `${amount} USDC` },
                ...(reference ? [{ label: dp.release.deal, value: <span dir="ltr">{reference}</span>, id: 'reference' }] : []),
              ]} />
            </div>
          </div>
          {view.onBothRecords !== null ? (
            <p className="text-[13px] text-[var(--ink-secondary)]">
              {view.onBothRecords ? dl.onBothRecords : view.onBothRecords === false ? dl.recordPending : dl.completeBody}
            </p>
          ) : null}
          {view.recordNudge ? <RecordNudge /> : null}
          {settledParty && !viewerIsBuyer && profile?.handle ? (
            <Link href={`/r/${profile.handle}`} target="_blank" rel="noopener" className={SECONDARY_CLASS}>
              {dp.yourRecord}
            </Link>
          ) : null}
          {address ? (
            <div className="grid gap-2">
              <a href="#rate" className={PRIMARY_CLASS}>{dp.rateWork}</a>
              {viewerIsBuyer ? (
                <button
                  type="button"
                  onClick={() => { setOpenRow('receipts'); document.getElementById('deal-row-receipts')?.scrollIntoView({ block: 'center' }); }}
                  className={SECONDARY_CLASS}
                >
                  {dp.getReceipt}
                </button>
              ) : null}
              <Link href="/deals" className={SECONDARY_CLASS}>{dp.backToDeals}</Link>
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <section data-steps-card aria-labelledby="deal-amount" className={`${CARD_CLASS} p-5 lg:p-6`}>
            <div className="flex min-h-11 items-center justify-between gap-3">
              <p role="status" aria-live="polite" className="min-w-0 text-[13px] text-[var(--ink-secondary)]">{moneyLine}</p>
              {referenceButton}
            </div>
            <h1 id="deal-amount" className="mt-1">
              <Price usdc={Number(deal.dealAmountUsdc)} size="hero" figureClassName="text-[56px] font-semibold leading-none tracking-[-0.04em] text-[var(--ink)]" />
            </h1>
            <div className="mt-5 border-t border-[var(--line)] pt-5">
              <DealRoute deal={deal} />
            </div>
            <div className="lg:mt-6 has-[>[data-move-bar]:empty]:hidden">{moveBar}</div>
          </section>
          {moment ? <div>{moment}</div> : null}
        </>
      )}
      {settled ? moveBar : null}

      {deal.dispute && address ? (
        <DisputePanel jobId={deal.jobId} dispute={deal.dispute} viewerIsBuyer={viewerIsBuyer} caller={address} name={name} myName={displayName} openedBy={deal.disputedBy ?? null} heldUsdc={moneySplit(deal)?.heldUsdc ?? null} onChanged={onChanged} />
      ) : null}
      </div>

      <ul aria-label={copy.protectedDeal} className={`${CARD_CLASS} mt-6 divide-y divide-[var(--line)] px-5 lg:px-6`}>
        {layers.filter(({ key }) => key !== 'progress' && key !== 'problem').map(({ key, attention }) => {
          const isOpen = openRow === key;
          return (
            <li key={key} id={`deal-row-${key}`} className="scroll-mt-24">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`deal-row-${key}-body`}
                onClick={() => setOpenRow(isOpen ? null : key)}
                className="flex min-h-[52px] w-full items-center gap-3 py-3 text-start text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ink)]"
              >
                <span className="flex shrink-0 items-center gap-2 text-[var(--ink-secondary)]">
                  {attention ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--ink)]" /> : null}
                  {rowTitle[key]}
                  {attention ? <span className="sr-only">{copy.layers.needsYou}</span> : null}
                </span>
                <span dir="auto" className="min-w-0 flex-1 truncate text-end font-medium text-[var(--ink)]">{rowSummary[key] ?? ''}</span>
                <Icon
                  name="chevron-right"
                  size={16}
                  className={cn('shrink-0 text-[var(--ink-muted)] transition-transform duration-[var(--dur-fade)] motion-reduce:transition-none', isOpen ? '-rotate-90' : 'rotate-90')}
                />
              </button>
              {isOpen ? (
                <div id={`deal-row-${key}-body`} className="pb-5">
                  {rowBody(key)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Room for the move bar, so it never covers the last row on a phone. */}
      <div aria-hidden className="h-44 lg:hidden" />

      <Sheet open={panel === 'messages'} title={s.messages} onClose={close}>
        {address ? <ChatPanel jobId={deal.jobId} caller={address} counterpartyLabel={name} counterpartyAddress={counterparty} draftSeed={draft?.text} draftSeedKey={draft?.key} /> : null}
      </Sheet>
      <Sheet open={panel === 'record'} title={s.record} onClose={close}>
        {card ? <TrustCard bare card={card} onOpenPassport={() => window.open(`/credit-passport/${counterparty}`, '_blank', 'noopener,noreferrer')} /> : null}
      </Sheet>
      {address ? (
        <>
          <DeliverSheet open={panel === 'deliver'} deal={deal} caller={address} name={name} onClose={close} onDone={done} />
          <AnswerTimeSheet open={panel === 'answerTime'} deal={deal} caller={address} name={name} onClose={close} onDone={done} />
          <AnswerCancelSheet open={panel === 'answerCancel'} deal={deal} caller={address} name={name} onClose={close} onDone={done} />
          <TurnDownSheet open={panel === 'turnDown'} deal={deal} caller={address} name={name} onClose={close} onDone={done} />
          <ProblemSheet open={panel === 'problem'} deal={deal} caller={address} name={name} options={problems} wrong={problems.includes('dispute') ? wrongChoices(deal, viewer) : null} onAskChanges={() => { setDraft({ text: dp.changesDraft, key: Date.now() }); openMessages(); }} onClose={close} onDone={done} />
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
