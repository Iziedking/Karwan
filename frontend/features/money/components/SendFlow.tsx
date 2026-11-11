'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, m } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { RecordDoneLine } from '@/shared/chain/RecordDoneLine';
import { Hint } from '@/shared/components/Hint';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { ProductBackLink } from '@/shared/components/ProductBackLink';
import { PersonRecord } from '@/shared/components/PersonRecord';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAddressKind } from '@/shared/hooks/useAddressKind';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { dur, ease } from '@/shared/motion/tokens';
import { moneySounds } from '@/shared/sound/moneySounds';
import { CHIP, PRIMARY, SECONDARY } from '@/shared/ui/controls';
import { fill } from '@/features/deals/workspace/presentation';
import { MoneyOutNotice } from '@/features/moneyOut/MoneyOutNotice';
import { useMoneyText } from '../hooks/useMoneyText';
import { useAmountInput } from '../hooks/useAmountInput';
import { sendAvailable } from '../sendFromWhole';
import { pressKey } from '../amountEntry';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import { useMoneyMove } from '../hooks/useMoneyMove';
import { useTagRecipient } from '../hooks/useTagRecipient';
import {
  SHEET_STEPS,
  chipAmount,
  groupAddress,
  recipientInput,
  sheetBlocker,
  sheetBusy,
  sheetProgress,
  shortfall,
  spendable,
  tagLookupStatus,
  type RecipientStatus,
  type SheetState,
} from '../moneySheetModel';
import { AddressText } from './AddressText';
import { AmountHero } from './AmountHero';
import { Keypad } from './Keypad';
import { fromOtherNetworkHref } from './MoneySheet';

const CARD = 'rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]';

/// Send, as its own page (view 50): who, then the amount large with a keypad
/// on a phone, then a confirm sheet over it, then progress and the receipt
/// under the same amount. The checks and the move are MoneySheet's, unchanged.
/// The longest note a send carries; the server keeps the same limit.
const NOTE_MAX = 120;

export function SendFlow({ prefillRecipient, prefillAmount, prefillSaid, prefillNote, onClose }: {
  prefillRecipient?: string;
  prefillAmount?: number;
  /// The amount as it was said to the assistant, in the person's own currency (view 77).
  prefillSaid?: { currency: string; amount: string };
  prefillNote?: string;
  onClose: () => void;
}) {
  const messages = useTranslations();
  const t = messages.money;
  const flow = t.sendFlow;
  const one = messages.moneyMove.one;
  const money = useMoneyText();
  const auth = useAuth();
  const pathname = usePathname();
  const reduce = useHydratedReducedMotion();
  const keypad = useMediaQuery('(pointer: coarse)');
  const balances = useMoneyBalances();
  const { refetch } = balances;
  const { state, start, checkAgain, reset } = useMoneyMove();
  const titleId = useId();
  const confirmId = useId();
  const amountId = useId();
  const recipientId = useId();
  const noteId = useId();
  const amountRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const announced = useRef<SheetState['kind'] | null>(null);
  const inFlight = useRef(false);
  const advanced = useRef(false);
  const [stage, setStage] = useState<'who' | 'amount'>('who');
  const [confirming, setConfirming] = useState(false);
  const [recipient, setRecipient] = useState(prefillRecipient ?? '');
  const amt = useAmountInput(prefillAmount ?? null, prefillSaid);
  const { typed, setTyped } = amt;
  const [pressedText, setPressedText] = useState('');
  const [pressed, setPressed] = useState<number | null>(null);
  const [note, setNote] = useState((prefillNote ?? '').slice(0, NOTE_MAX));
  const [noting, setNoting] = useState(!!prefillNote);
  const recent = useQuery({ queryKey: ['recent-people'], queryFn: () => api.recentPeople(), enabled: auth.isAuthenticated, staleTime: 60_000 });
  const people = recent.data?.people ?? [];

  useEffect(() => {
    if (announced.current === state.kind) return;
    announced.current = state.kind;
    const keys = state.kind === 'confirmed' || state.kind === 'slow' ? { ids: [state.reference, state.txHash] } : { ids: [] };
    if (state.kind === 'confirmed') {
      moneySounds.outcome('success', keys);
      refetch();
    } else if (state.kind === 'slow') {
      moneySounds.outcome('pending', keys);
    } else if (state.kind === 'reverted') {
      moneySounds.outcome('reverted', keys);
    }
  }, [state, refetch]);

  const input = recipientInput(recipient);
  const tagLookup = useTagRecipient(input.kind === 'tag' ? input.tag : null);
  const paidTag = tagLookup?.state === 'done' && tagLookup.result.found && !tagLookup.result.self ? tagLookup.result : null;
  const recipientCheck = useAddressKind(input.kind === 'address' ? recipient : null, {
    trustedAddresses: [auth.address, balances.agents?.buyer, balances.agents?.seller],
  });
  const recipientStatus: RecipientStatus =
    input.kind === 'empty'
      ? 'missing'
      : tagLookup
        ? tagLookupStatus(tagLookup)
        : recipientCheck.kind === 'eoa' || recipientCheck.kind === 'contract'
          ? 'ok'
          : recipientCheck.kind === 'checking'
            ? 'checking'
            : 'invalid';
  const sendTo = paidTag ? paidTag.address : recipientCheck.normalized;
  const toName = paidTag ? `@${paidTag.tag}` : recipientCheck.normalized ? groupAddress(recipientCheck.normalized) : '';
  const walletSigned = auth.method === 'web3';
  const available = balances.balance === null ? null : sendAvailable(balances.balance, balances.pool, balances.poolLoaded);
  const max = available === null ? null : spendable(available, 'send', walletSigned);
  // What is with the agents is in the balance but not in this send (view 77); to the cent, rounded down.
  const withAgents = Math.floor(((balances.buyer ?? 0) + (balances.seller ?? 0)) * 100 + 1e-6) / 100;
  const amount = amt.usdc;
  const blocker = sheetBlocker({ move: 'send', amount, available: max, recipient: recipientStatus });
  const busy = sheetBusy(state);
  const moved = pressed ?? amount ?? 0;
  const progress = sheetProgress(state);
  const stepLabel = { signed: t.sheet.stepSigned, sent: t.sheet.stepSent, confirmed: t.sheet.stepConfirmed };
  const fade = { initial: { opacity: 0, y: reduce ? 0 : 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: reduce ? dur.micro : dur.fast, ease: ease.out } };

  // A link that names the person (?to=@ada) goes straight to the amount once they are found.
  useEffect(() => {
    if (advanced.current || !prefillRecipient || recipientStatus !== 'ok') return;
    advanced.current = true;
    setStage('amount');
  }, [prefillRecipient, recipientStatus]);

  useEffect(() => {
    if (stage === 'amount' && !keypad) amountRef.current?.focus();
  }, [stage, keypad]);

  async function send() {
    if (inFlight.current || blocker !== null || amount === null) return;
    inFlight.current = true;
    moneySounds.submit();
    // The figure on the confirm is the one that moves (view 55): the quote
    // holds it, and the record keeps it.
    const quote = await amt.quote();
    const moving = quote && max !== null && quote.usdc <= max ? quote.usdc : amount;
    setPressed(moving);
    setPressedText(amt.display);
    setConfirming(false);
    void start({
      move: 'send',
      agent: 'buyer',
      agentAddress: balances.agents?.buyer as `0x${string}` | undefined,
      amount: moving,
      ...(quote && moving === quote.usdc ? { quote: quote.token } : {}),
      recipient: paidTag ? (paidTag.address as `0x${string}`) : recipientCheck.normalized ?? undefined,
      source: 'balance',
      walletBalance: balances.balance,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  }

  function tryAgain() {
    inFlight.current = false;
    announced.current = null;
    setPressed(null);
    reset();
    setStage('amount');
  }

  const person = paidTag ? (
    <PersonRecord address={paidTag.address} size={40} known={{ name: paidTag.displayName, tag: paidTag.tag }} />
  ) : recipientCheck.normalized ? (
    <p dir="ltr" className="mono truncate text-[15px] font-medium text-[var(--ink)]">{groupAddress(recipientCheck.normalized)}</p>
  ) : null;

  return (
    <section aria-labelledby={titleId} className="mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-[480px] flex-col pb-8 pt-2 sm:px-4">
      <div data-own-back className="-ms-2 mb-3 empty:hidden">
        <ProductBackLink pathname={pathname} isAuthenticated={auth.isAuthenticated} />
      </div>
      <h1 id={titleId} className={state.kind === 'editing' && stage === 'who' ? 'text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]' : 'sr-only'}>{t.sheet.titleSend}</h1>

      <AnimatePresence mode="wait" initial={false}>
        {state.kind !== 'editing' ? (
          <m.div key="result" {...fade} className="flex flex-1 flex-col">
            <div className="flex flex-col items-center gap-5 pt-10 text-center">
              {paidTag ? <PersonRecord address={paidTag.address} size={56} known={{ name: paidTag.displayName, tag: paidTag.tag }} /> : null}
              <p dir="ltr" data-sent-amount className="text-[64px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--ink)]">
                {pressedText || money.text(moved)}
              </p>
              <p className="text-[15px] font-medium text-[var(--ink-secondary)]">
                {fill(state.kind === 'confirmed' ? flow.sentTo : flow.sendingTo, { name: toName })}
              </p>
            </div>
            <div className="mt-8 space-y-4">
              {state.kind === 'confirmed' ? (
                <>
                  <dl className={`${CARD} px-5 text-[15px] tabular-nums`}>
                    <Row label={flow.to} value={toName} />
                    {note.trim() ? <Row label={flow.note} value={note.trim()} plain /> : null}
                    <Row label={t.sheet.yourBalance} value={available === null ? '' : money.text(available)} />
                    {state.reference ? <Row label={t.sheet.reference} value={state.reference} mono /> : null}
                  </dl>
                  <RecordDoneLine show={state.recordSetUp === true} />
                </>
              ) : state.kind === 'guarded' ? (
                <MoneyOutNotice refusal={state.refusal} destination={sendTo ? { chain: 'arc', address: sendTo } : undefined} onCleared={tryAgain} />
              ) : progress ? (
                <>
                  <ol aria-label={t.sheet.progressLabel} className={`${CARD} px-5`}>
                    {SHEET_STEPS.map((step, index) => {
                      const done = index < progress.done;
                      const current = progress.current === step;
                      return (
                        <li key={step} aria-current={current ? 'step' : undefined} className="flex items-center gap-3 border-b border-[var(--line)] py-3.5 last:border-b-0">
                          <span
                            aria-hidden
                            className={`size-3 shrink-0 rounded-full ${done ? 'bg-[var(--ink)]' : current ? 'border-2 border-[var(--ink)]' : 'border-[1.5px] border-[var(--line-strong)]'}`}
                          />
                          <span className={`text-[15px] ${done || current ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>{stepLabel[step]}</span>
                        </li>
                      );
                    })}
                  </ol>
                  {state.kind === 'slow' ? (
                    <p role="status" className="text-[15px] leading-relaxed text-[var(--ink)]">{t.sheet.slow}</p>
                  ) : (
                    <p className="text-center text-[14px] font-medium text-[var(--ink-secondary)]">{flow.leave}</p>
                  )}
                </>
              ) : (
                <p role="alert" className="border-s-2 border-[var(--color-critical)] ps-3 text-[15px] leading-relaxed text-[var(--ink)]">
                  {state.kind === 'reverted' ? t.sheet.reverted : state.kind === 'failed' && state.declined ? t.sheet.declined : t.sheet.failed}
                </p>
              )}
            </div>
            <div className="mt-auto flex flex-col gap-2 pt-8">
              {state.kind === 'confirmed' ? (
                <button type="button" onClick={onClose} className={`${PRIMARY} w-full`}>{t.sheet.done}</button>
              ) : state.kind === 'slow' ? (
                <>
                  <button type="button" onClick={() => void checkAgain()} className={`${PRIMARY} w-full`}>{t.sheet.checkAgain}</button>
                  <button type="button" onClick={onClose} className={`${SECONDARY} w-full`}>{t.sheet.close}</button>
                </>
              ) : state.kind === 'failed' || state.kind === 'reverted' ? (
                <>
                  <button type="button" onClick={tryAgain} className={`${PRIMARY} w-full`}>{t.sheet.tryAgain}</button>
                  <button type="button" onClick={onClose} className={`${SECONDARY} w-full`}>{t.sheet.close}</button>
                </>
              ) : state.kind === 'guarded' ? (
                <button type="button" onClick={onClose} className={`${SECONDARY} w-full`}>{t.sheet.close}</button>
              ) : null}
            </div>
          </m.div>
        ) : stage === 'who' ? (
          <m.div key="who" {...fade} className="flex flex-1 flex-col">
            <label htmlFor={recipientId} className="mt-6 text-[14px] font-medium text-[var(--ink-secondary)]">{t.sheet.recipientLabel}</label>
            <input
              id={recipientId}
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder={t.sheet.recipientPlaceholder}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              dir="ltr"
              className="mt-2 min-h-[52px] w-full rounded-[14px] border border-[var(--line)] bg-[var(--surface)] px-4 text-[16px] font-medium text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            />
            <div className="mt-3 min-h-6">
              {tagLookup ? (
                tagLookup.state === 'checking' ? (
                  <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{t.sheet.recipientChecking}</p>
                ) : tagLookup.state === 'error' ? (
                  <p className="text-[14px] text-[var(--color-critical)]">{t.sheet.tagError}</p>
                ) : !tagLookup.result.found ? (
                  <p className="text-[14px] text-[var(--color-critical)]">{fill(t.sheet.tagNotFound, { tag: tagLookup.result.tag })}</p>
                ) : tagLookup.result.self ? (
                  <p className="text-[14px] text-[var(--color-critical)]">{t.sheet.tagSelf}</p>
                ) : (
                  <div className={`${CARD} p-4`}>
                    <PersonRecord address={tagLookup.result.address} size={40} known={{ name: tagLookup.result.displayName, tag: tagLookup.result.tag }} />
                    <p className="sr-only">{fill(t.sheet.tagFound, { name: tagLookup.result.displayName, tag: tagLookup.result.tag })}</p>
                  </div>
                )
              ) : recipientStatus === 'invalid' ? (
                <p className="text-[14px] text-[var(--color-critical)]">{t.sheet.recipientInvalid}</p>
              ) : recipientStatus === 'checking' ? (
                <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{t.sheet.recipientChecking}</p>
              ) : recipientStatus === 'ok' && recipientCheck.normalized ? (
                <div className="space-y-1 text-[14px]">
                  <p className="text-[var(--ink)]"><AddressText template={t.sheet.recipientCheck} address={groupAddress(recipientCheck.normalized)} /></p>
                  {recipientCheck.kind === 'contract' ? <p className="text-[var(--color-warning)]">{t.sheet.recipientContract}</p> : null}
                </div>
              ) : null}
            </div>
            {people.length > 0 && input.kind === 'empty' ? (
              <div className="mt-6">
                <p className="text-[14px] font-medium text-[var(--ink-secondary)]">{flow.recent}</p>
                <ul className="-mx-1 mt-3 flex gap-4 overflow-x-auto px-1 pb-1">
                  {people.map((person) => (
                    <li key={person.address} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setRecipient(`@${person.tag}`)}
                        className="flex w-16 flex-col items-center gap-2 rounded-[14px] py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
                      >
                        <PersonAvatar address={person.address} name={person.displayName} size={56} />
                        <span className="w-full truncate text-center text-[13px] font-medium text-[var(--ink)]">{person.displayName.split(' ')[0]}</span>
                        <span className="sr-only">@{person.tag}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {walletSigned ? (
              <Link
                href={fromOtherNetworkHref(sendTo && recipientStatus === 'ok' ? sendTo : null, amount)}
                className="mt-2 inline-flex min-h-11 items-center self-start text-[14px] font-semibold text-[var(--ink)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              >
                {t.sheet.otherNetwork}
              </Link>
            ) : null}
            <div className="mt-auto pt-8">
              <button type="button" onClick={() => setStage('amount')} disabled={recipientStatus !== 'ok'} className={`${PRIMARY} w-full`}>{flow.next}</button>
            </div>
          </m.div>
        ) : (
          <m.div key="amount" {...fade} className="flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">{person}</div>
              <button type="button" onClick={() => setStage('who')} className="min-h-11 shrink-0 px-2 text-[14px] font-semibold text-[var(--ink-secondary)] underline underline-offset-4 hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]">
                {flow.change}
              </button>
            </div>
            <div className="mt-12">
              <AmountHero id={amountId} label={t.sheet.amountLabel} value={typed} onChange={setTyped} keypad={keypad} inputRef={amountRef} sign={amt.sign} />
            </div>
            <p data-send-ready className="mt-3 inline-flex items-center justify-center gap-1.5 text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">
              {available === null ? ' ' : money.fill(one.readyToSend, { amount: available })}
              {available !== null ? <Hint side="bottom">{t.sheet.availableHint}</Hint> : null}
            </p>
            {withAgents > 0 ? (
              <p data-send-with-agents className="mt-1 text-center text-[13px] font-medium text-[var(--ink-secondary)]">
                {money.fill(one.withAgents, { amount: withAgents })}{' '}
                <Link href="/account?where=1" className="font-semibold text-[var(--ink)] underline underline-offset-4">{messages.moneyPages.withdraw.bringIt}</Link>
              </p>
            ) : null}
            <div className="mt-5 flex justify-center gap-2">
              {(['quarter', 'half', 'max'] as const).map((chip) => (
                <button key={chip} type="button" className={CHIP} disabled={max === null || max <= 0} onClick={() => { if (max !== null) amt.setFromUsdc(chipAmount(max, chip), 'down'); }}>
                  {t.sheet[chip]}
                </button>
              ))}
              {noting ? null : (
                <button type="button" className={CHIP} onClick={() => setNoting(true)}>{flow.addNote}</button>
              )}
            </div>
            {noting ? (
              <div className="mt-5">
                <label htmlFor={noteId} className="sr-only">{flow.note}</label>
                <input
                  id={noteId}
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX))}
                  maxLength={NOTE_MAX}
                  autoFocus={!prefillNote}
                  placeholder={flow.notePlaceholder}
                  autoComplete="off"
                  className="min-h-12 w-full rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 text-center text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
                />
              </div>
            ) : null}
            {blocker === 'short' && amount !== null && max !== null ? (
              <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 text-[14px] text-[var(--ink)]">
                <span>{money.fill(t.sheet.short, { amount: shortfall(amount, max) }, {}, { exact: true })}</span>
                <a href="/add" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{t.sheet.addUsdc}</a>
              </p>
            ) : null}
            <div className="mt-auto space-y-4 pt-8">
              {keypad ? <Keypad onKey={(key) => setTyped((value) => pressKey(value, key))} label={t.entry.keypad} backLabel={t.entry.back} /> : null}
              <button type="button" onClick={() => setConfirming(true)} disabled={blocker !== null} className={`${PRIMARY} w-full`}>
                {amount === null ? t.sheet.ctaNoAmount : flow.next}
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <ConfirmSheetShell open={confirming && state.kind === 'editing'} labelledBy={confirmId} busy={busy} onClose={() => setConfirming(false)} initialFocus={confirmRef}>
        <h2 id={confirmId} className="sr-only">{flow.confirmTitle}</h2>
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          {paidTag ? <PersonRecord address={paidTag.address} size={48} known={{ name: paidTag.displayName, tag: paidTag.tag }} /> : null}
          <p dir="ltr" data-confirm-amount className="text-[48px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--ink)]">{amt.display}</p>
        </div>
        <dl className={`${CARD} mt-6 bg-[var(--raised)] px-5 text-[15px]`}>
          <Row label={flow.to} value={toName} />
          <Row label={t.sheet.from} value={t.sheet.yourBalance} />
          {note.trim() ? <Row label={flow.note} value={note.trim()} plain /> : null}
          <Row label={flow.network} value="Arc" />
        </dl>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--ink)]">
          {money.fill(paidTag ? t.sheet.consequenceSendTag : t.sheet.consequenceSend, { amount: amount ?? 0 }, { tag: paidTag?.tag ?? '' }, { exact: true })}
        </p>
        <p className="mt-1 text-[14px] font-medium text-[var(--color-warning)]">{t.sheet.sendIrreversible}</p>
        <button ref={confirmRef} type="button" onClick={send} disabled={blocker !== null} className={`${PRIMARY} mt-6 w-full gap-2`}>
          {money.fill(t.sheet.ctaSend, { amount: amount ?? 0 }, {}, { exact: true })}
        </button>
      </ConfirmSheetShell>

      <p role="status" aria-live="polite" className="sr-only">{state.kind === 'confirmed' ? t.sheet.confirmed : ''}</p>
    </section>
  );
}

function Row({ label, value, mono = false, plain = false }: { label: string; value: string; mono?: boolean; plain?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[var(--line)] py-3.5 last:border-b-0">
      <dt className="text-[var(--ink-secondary)]">{label}</dt>
      <dd dir={plain ? 'auto' : 'ltr'} className={plain ? 'min-w-0 text-end font-medium text-[var(--ink)] [overflow-wrap:anywhere]' : mono ? 'mono text-[13px] tracking-[0.04em] text-[var(--ink)]' : 'font-medium text-[var(--ink)]'}>{value}</dd>
    </div>
  );
}
