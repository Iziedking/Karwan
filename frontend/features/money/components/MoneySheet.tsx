'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAddressKind, type AddressKind } from '@/shared/hooks/useAddressKind';
import { useHydratedReducedMotion } from '@/shared/hooks/useHydratedReducedMotion';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import type { MoneyCopy } from '@/shared/i18n/messages/money';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { dur } from '@/shared/motion/tokens';
import { moneySounds } from '@/shared/sound/moneySounds';
import { fill } from '@/features/deals/workspace/presentation';
import { planTopUp } from '@/features/bridge/routePlan';
import { formatAmount, formatBalance } from '../balanceModel';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import { useMoneyMove } from '../hooks/useMoneyMove';
import {
  SHEET_STEPS,
  chipAmount,
  groupAddress,
  parseAmount,
  sheetBlocker,
  sheetBusy,
  sheetProgress,
  shortfall,
  spendable,
  type AgentKey,
  type MoneyMove,
  type RecipientStatus,
  type SheetState,
} from '../moneySheetModel';
import { AddressText } from './AddressText';
import { CHIP, PRIMARY, SECONDARY } from '@/shared/ui/controls';

export interface MoneySheetProps {
  open: boolean;
  onClose: () => void;
  /// The move the sheet opens on. Top-up and withdraw swap in place.
  move: MoneyMove;
  agent: AgentKey;
  prefillAmount?: number;
  prefillRecipient?: string;
  /// Called when the person presses Done after a confirmed move.
  onDone?: () => void;
}

/// The one card for quick moves: agent top-up, agent withdrawal and a send to
/// an Arc address. The amount is the loudest thing in it, the button says
/// exactly what will happen, and the result lands in place.
export function MoneySheet({ open, onClose, move: openedOn, agent, prefillAmount, prefillRecipient, onDone }: MoneySheetProps) {
  const t = useTranslations().money;
  const { locale } = useLocale();
  const auth = useAuth();
  const reduce = useHydratedReducedMotion();
  const balances = useMoneyBalances();
  const { refetch } = balances;
  const { state, start, checkAgain, reset } = useMoneyMove();
  const titleId = useId();
  const amountId = useId();
  const recipientId = useId();
  const amountRef = useRef<HTMLInputElement | null>(null);
  const announced = useRef<SheetState['kind'] | null>(null);
  const inFlight = useRef(false);
  const [move, setMove] = useState<MoneyMove>(openedOn);
  const [typed, setTyped] = useState('');
  const [recipient, setRecipient] = useState('');
  const [pressed, setPressed] = useState<number | null>(null);

  // Opening starts clean: the move it was opened for, the prefilled amount and
  // no result left over from last time.
  useEffect(() => {
    if (!open) return;
    setMove(openedOn);
    setTyped(prefillAmount ? String(prefillAmount) : '');
    setRecipient(prefillRecipient ?? '');
    setPressed(null);
    announced.current = null;
    inFlight.current = false;
    reset();
  }, [open, openedOn, prefillAmount, prefillRecipient, reset]);

  // One sound per outcome, however often the state object is rebuilt.
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

  const walletSigned = auth.method === 'web3';
  const agentAddress = (agent === 'buyer' ? balances.agents?.buyer : balances.agents?.seller) as `0x${string}` | undefined;
  const agentBalance = agent === 'buyer' ? balances.buyer : balances.seller;
  const agentName = agent === 'buyer' ? t.home.buyingAgent : t.home.sellingAgent;
  const amount = parseAmount(typed);
  const route =
    move === 'topUp' && amount !== null && balances.balance !== null
      ? planTopUp({ amount, balance: balances.balance, pool: balances.pool })
      : null;
  const fromPool = move === 'topUp' && balances.balance !== null && balances.pool > balances.balance;
  const available =
    move === 'withdraw'
      ? agentBalance
      : balances.balance === null
        ? null
        : move === 'topUp'
          ? Math.max(balances.balance, balances.pool)
          : balances.balance;
  const max = available === null ? null : spendable(available, move, walletSigned && !fromPool);

  const recipientCheck = useAddressKind(move === 'send' ? recipient : null, {
    trustedAddresses: [auth.address, balances.agents?.buyer, balances.agents?.seller],
  });
  const recipientStatus: RecipientStatus =
    move !== 'send'
      ? 'ok'
      : recipientCheck.kind === 'eoa' || recipientCheck.kind === 'contract'
        ? 'ok'
        : recipientCheck.kind === 'checking'
          ? 'checking'
          : recipient.trim() === ''
            ? 'missing'
            : 'invalid';
  const blocker = sheetBlocker({ move, amount, available: max, recipient: recipientStatus });
  const busy = sheetBusy(state);
  const moved = pressed ?? amount ?? 0;

  const title =
    move === 'send'
      ? t.sheet.titleSend
      : move === 'topUp'
        ? agent === 'buyer' ? t.sheet.titleTopUpBuyer : t.sheet.titleTopUpSeller
        : agent === 'buyer' ? t.sheet.titleWithdrawBuyer : t.sheet.titleWithdrawSeller;
  const consequence =
    move === 'send'
      ? t.sheet.consequenceSend
      : move === 'withdraw'
        ? t.sheet.consequenceWithdraw
        : agent === 'buyer' ? t.sheet.consequenceTopUpBuyer : t.sheet.consequenceTopUpSeller;
  const cta = move === 'send' ? t.sheet.ctaSend : move === 'withdraw' ? t.sheet.ctaWithdraw : t.sheet.ctaTopUp;
  const doneLine =
    move === 'send'
      ? t.sheet.doneSend
      : move === 'withdraw'
        ? t.sheet.doneWithdraw
        : agent === 'buyer' ? t.sheet.doneTopUpBuyer : t.sheet.doneTopUpSeller;
  const fromName = move === 'withdraw' ? agentName : route?.kind === 'pool' ? t.home.heldAnyNetwork : t.sheet.yourBalance;
  const fromAmount = move === 'withdraw' ? agentBalance : route?.kind === 'pool' ? balances.pool : balances.balance;
  const toName = move === 'withdraw' ? t.sheet.yourBalance : agentName;
  const toAmount = move === 'withdraw' ? balances.balance : agentBalance;
  const progress = sheetProgress(state);
  const stepLabel = { signed: t.sheet.stepSigned, sent: t.sheet.stepSent, confirmed: t.sheet.stepConfirmed };
  const fade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: reduce ? dur.micro : dur.fast },
  };

  function press() {
    // A second press while the first is on its way does nothing. The button
    // stays in the DOM for its exit fade, so the state alone cannot stop it.
    if (inFlight.current || blocker !== null || amount === null) return;
    if (move !== 'send' && !agentAddress) return;
    inFlight.current = true;
    moneySounds.submit();
    setPressed(amount);
    void start({
      move,
      agent,
      agentAddress,
      amount,
      recipient: move === 'send' ? recipientCheck.normalized ?? undefined : undefined,
      source: route?.kind === 'pool' ? 'pool' : 'balance',
    });
  }

  function tryAgain() {
    inFlight.current = false;
    announced.current = null;
    setPressed(null);
    reset();
  }

  function finish() {
    onClose();
    onDone?.();
  }

  return (
    <ConfirmSheetShell open={open} labelledBy={titleId} busy={busy} onClose={onClose} initialFocus={amountRef}>
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-[20px] font-semibold text-[var(--lp-dark)]">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={t.sheet.close}
          className="-me-2 -mt-2 inline-grid size-11 shrink-0 place-items-center rounded-full text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <span aria-hidden className="text-[22px] leading-none">×</span>
        </button>
      </div>

      {move === 'send' ? (
        <div className="mt-6">
          <label htmlFor={recipientId} className="text-[13px] font-medium text-[var(--lp-text-sub)]">{t.sheet.recipientLabel}</label>
          <input
            id={recipientId}
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            disabled={state.kind !== 'editing'}
            placeholder={t.sheet.recipientPlaceholder}
            spellCheck={false}
            autoComplete="off"
            dir="ltr"
            className="mt-2 min-h-12 w-full rounded-[10px] border border-[var(--lp-outline-strong)] bg-transparent px-3 text-[15px] text-[var(--lp-dark)] placeholder:text-[var(--lp-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
          <RecipientLine
            status={recipientStatus}
            kind={recipientCheck.kind}
            grouped={recipientCheck.normalized ? groupAddress(recipientCheck.normalized) : null}
            copy={t.sheet}
          />
          <Link
            href="/bridge?intent=send"
            className="mt-2 inline-flex min-h-11 items-center text-[14px] font-semibold text-[var(--lp-dark)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {t.sheet.otherNetwork}
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-y border-[var(--lp-border-light)] py-4">
          <Place label={t.sheet.from} name={fromName} amount={fromAmount} locale={locale} />
          <button
            type="button"
            onClick={() => setMove(move === 'topUp' ? 'withdraw' : 'topUp')}
            disabled={state.kind !== 'editing'}
            aria-label={t.sheet.swap}
            className="inline-grid size-11 place-items-center rounded-full border border-[var(--lp-outline-strong)] text-[var(--lp-dark)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span aria-hidden className="text-[18px] leading-none">⇄</span>
          </button>
          <Place label={t.sheet.to} name={toName} amount={toAmount} locale={locale} end />
        </div>
      )}

      <div className="mt-6">
        <label htmlFor={amountId} className="text-[13px] font-medium text-[var(--lp-text-sub)]">{t.sheet.amountLabel}</label>
        <div className="mt-2 flex items-baseline gap-2 border-b-2 border-[var(--lp-dark)] pb-2 focus-within:border-[var(--accent)]">
          <input
            id={amountId}
            ref={amountRef}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={state.kind !== 'editing'}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            dir="ltr"
            className="min-w-0 flex-1 bg-transparent text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-muted)]"
          />
          <span className="text-[18px] font-semibold text-[var(--lp-text-sub)]">USDC</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] tabular-nums text-[var(--lp-text-sub)]">
            {available === null ? ' ' : fill(t.sheet.available, { amount: formatBalance(available, locale) })}
          </p>
          <div className="flex gap-2">
            {(['quarter', 'half', 'max'] as const).map((chip) => (
              <button
                key={chip}
                type="button"
                className={CHIP}
                disabled={max === null || max <= 0 || state.kind !== 'editing'}
                onClick={() => {
                  if (max !== null) setTyped(String(chipAmount(max, chip)));
                }}
              >
                {t.sheet[chip]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-[13px] text-[var(--lp-text-sub)]">{t.sheet.timeSeconds}</p>

      <AnimatePresence mode="wait" initial={false}>
        {state.kind === 'editing' ? (
          <motion.div key="editing" {...fade} className="mt-6">
            <p className="text-[15px] leading-relaxed text-[var(--lp-dark)]">
              {fill(consequence, { amount: formatAmount(amount ?? 0, locale) })}
            </p>
            {move === 'send' ? (
              <p className="mt-2 text-[14px] font-medium text-[var(--color-warning)]">{t.sheet.sendIrreversible}</p>
            ) : null}
            {blocker === 'short' && amount !== null && max !== null ? (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 text-[14px] text-[var(--lp-dark)]">
                <span>{fill(t.sheet.short, { amount: formatAmount(shortfall(amount, max), locale) })}</span>
                {move !== 'withdraw' ? (
                  <Link href="/bridge?intent=add" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                    {t.sheet.addUsdc}
                  </Link>
                ) : null}
              </p>
            ) : null}
            <button type="button" onClick={press} disabled={blocker !== null} className={`${PRIMARY} mt-6 w-full`}>
              {amount === null ? t.sheet.ctaNoAmount : fill(cta, { amount: formatAmount(amount, locale) })}
            </button>
          </motion.div>
        ) : state.kind === 'confirmed' ? (
          <motion.div key="confirmed" {...fade} className="mt-6 space-y-4">
            <p className="flex items-center gap-3 text-[18px] font-semibold text-[var(--lp-dark)]">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[15px] text-[var(--accent-ink)]">✓</span>
              {fill(doneLine, { amount: formatAmount(moved, locale) })}
            </p>
            <dl className="space-y-1 text-[14px] tabular-nums text-[var(--lp-text-sub)]">
              <div className="flex justify-between gap-3">
                <dt>{t.sheet.yourBalance}</dt>
                <dd>{balances.balance === null ? '' : `${formatBalance(balances.balance, locale)} USDC`}</dd>
              </div>
              {move !== 'send' ? (
                <div className="flex justify-between gap-3">
                  <dt>{agentName}</dt>
                  <dd>{agentBalance === null ? '' : `${formatBalance(agentBalance, locale)} USDC`}</dd>
                </div>
              ) : null}
            </dl>
            {state.reference ? (
              <p className="text-[13px] text-[var(--lp-text-sub)]">
                {t.sheet.reference} <span className="mono tabular-nums text-[var(--lp-dark)]">{state.reference}</span>
              </p>
            ) : null}
            <button type="button" onClick={finish} className={`${PRIMARY} w-full`}>{t.sheet.done}</button>
          </motion.div>
        ) : progress ? (
          <motion.div key="progress" {...fade} className="mt-6 space-y-4">
            <ol aria-label={t.sheet.progressLabel} className="grid grid-cols-3 gap-2">
              {SHEET_STEPS.map((step, index) => {
                const done = index < progress.done;
                const current = progress.current === step;
                return (
                  <li
                    key={step}
                    aria-current={current ? 'step' : undefined}
                    className={`border-t-2 pt-2 text-[13px] ${done || current ? 'font-semibold text-[var(--lp-dark)]' : 'text-[var(--lp-text-sub)]'}`}
                    style={{ borderColor: done ? 'var(--lp-dark)' : current ? 'var(--accent)' : 'var(--lp-border-light)' }}
                  >
                    {stepLabel[step]}
                  </li>
                );
              })}
            </ol>
            {state.kind === 'slow' ? (
              <>
                <p role="status" className="text-[15px] leading-relaxed text-[var(--lp-dark)]">{t.sheet.slow}</p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => void checkAgain()} className={PRIMARY}>{t.sheet.checkAgain}</button>
                  <button type="button" onClick={onClose} className={SECONDARY}>{t.sheet.close}</button>
                </div>
              </>
            ) : null}
          </motion.div>
        ) : (
          <motion.div key="stopped" {...fade} className="mt-6 space-y-4">
            <p role="alert" className="border-s-2 border-[var(--color-critical)] ps-3 text-[15px] leading-relaxed text-[var(--lp-dark)]">
              {state.kind === 'reverted' ? t.sheet.reverted : state.kind === 'failed' && state.declined ? t.sheet.declined : t.sheet.failed}
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={tryAgain} className={PRIMARY}>{t.sheet.tryAgain}</button>
              <button type="button" onClick={onClose} className={SECONDARY}>{t.sheet.close}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p role="status" aria-live="polite" className="sr-only">{state.kind === 'confirmed' ? t.sheet.confirmed : ''}</p>
    </ConfirmSheetShell>
  );
}

function Place({ label, name, amount, locale, end = false }: {
  label: string;
  name: string;
  amount: number | null;
  locale: string;
  end?: boolean;
}) {
  return (
    <div className={end ? 'min-w-0 text-end' : 'min-w-0'}>
      <p className="text-[13px] text-[var(--lp-text-sub)]">{label}</p>
      <p className="truncate text-[15px] font-semibold text-[var(--lp-dark)]">{name}</p>
      <p className="text-[13px] tabular-nums text-[var(--lp-text-sub)]">{amount === null ? ' ' : `${formatBalance(amount, locale)} USDC`}</p>
    </div>
  );
}

function RecipientLine({ status, kind, grouped, copy }: {
  status: RecipientStatus;
  kind: AddressKind;
  grouped: string | null;
  copy: MoneyCopy['sheet'];
}) {
  if (status === 'missing') return null;
  if (status === 'invalid') return <p className="mt-2 text-[13px] text-[var(--color-critical)]">{copy.recipientInvalid}</p>;
  if (status === 'checking') return <p className="mt-2 text-[13px] text-[var(--lp-text-sub)]">{copy.recipientChecking}</p>;
  return (
    <div className="mt-2 space-y-1 text-[13px]">
      {grouped ? (
        <p className="text-[var(--lp-dark)]">
          <AddressText template={copy.recipientCheck} address={grouped} />
        </p>
      ) : null}
      {kind === 'contract' ? <p className="text-[var(--color-warning)]">{copy.recipientContract}</p> : null}
    </div>
  );
}
