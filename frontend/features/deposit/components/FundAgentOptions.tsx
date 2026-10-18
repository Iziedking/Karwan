'use client';
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { Icon } from '@/shared/components/Icon';
import { FundAgentFromBalance } from './FundAgentFromBalance';
import { FundAgentFromWallet } from './FundAgentFromWallet';
import { TopUpFromGateway } from '@/features/gateway/TopUpFromGateway';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { defaultFundRoute, fundingShortfall, type FundSource } from '../fundingPlan';

/// Where the money comes from, as a choice already made.
///
/// A bank asks which account to pay from and suggests one. So does this: the
/// amount is what the deal still needs, the sources are one list with their
/// balances and a line saying what each does, and the first source that covers
/// the amount is picked, so its action is the one obvious next step. Nothing
/// here moves money on its own; each source is the component that already owns
/// that movement, including its own balance check and its own error.
export type FundRoute = FundSource;

export function FundAgentOptions({
  /// The agent that needs the money.
  agent,
  /// The other agent's address, the one money can be moved FROM. Absent when the
  /// account has no second agent, in which case that route is not offered rather
  /// than offered and broken.
  otherAgentAddress,
  /// The agent wallet the money has to land in, for the agent-to-agent move.
  recipient,
  amountUsdc,
  /// What the paying agent already holds. Given, the amount asked for is only
  /// the shortfall.
  inPlaceUsdc,
  /// True for a Circle (email) account: the identity wallet holds the balance
  /// and the backend signs, so funding from it is one press and no chain switch.
  circleAccount,
  onFunded,
  onBusyChange,
}: {
  agent: 'buyer' | 'seller';
  otherAgentAddress?: string | null;
  recipient?: string | null;
  amountUsdc: number;
  inPlaceUsdc?: number | null;
  circleAccount: boolean;
  onFunded?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const copy = useTranslations().fundAgentOptions;
  const { locale } = useLocale();
  const money = useMoneyBalances();
  const needed = inPlaceUsdc === undefined ? amountUsdc : fundingShortfall(amountUsdc, inPlaceUsdc);
  const [chosen, setChosen] = useState<FundRoute | null>(null);
  const [amountInput, setAmountInput] = useState(() => String(needed));
  const [fundingBusy, setFundingBusy] = useState(false);
  const reportBusy = useCallback((busy: boolean) => {
    setFundingBusy(busy);
    onBusyChange?.(busy);
  }, [onBusyChange]);

  useEffect(() => {
    setAmountInput(String(needed));
  }, [needed]);

  const parsedAmount = Number(amountInput);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const fundingAmount = validAmount ? parsedAmount : 0;
  const hasOtherAgent = !!(otherAgentAddress && recipient);
  const otherAgentBalance = hasOtherAgent ? (agent === 'buyer' ? money.seller : money.buyer) : null;
  const route = chosen ?? defaultFundRoute(fundingAmount, { wallet: money.balance, otherAgent: otherAgentBalance });
  const usdc = (value: number | null) => (value === null ? null : `${value.toLocaleString(locale, { maximumFractionDigits: 2 })} USDC`);

  const routes: Array<{ id: FundRoute; label: string; detail: string; balance: string | null }> = [
    { id: 'wallet', label: copy.wallet.label, detail: copy.wallet.tooltip, balance: usdc(money.balance) },
    ...(hasOtherAgent
      ? [{
          id: 'otherAgent' as const,
          label: agent === 'buyer' ? copy.otherAgent.labelSeller : copy.otherAgent.labelBuyer,
          detail: copy.otherAgent.tooltip,
          balance: usdc(otherAgentBalance),
        }]
      : []),
    { id: 'chain', label: copy.chain.label, detail: copy.chain.tooltip, balance: null },
  ];

  function onArrow(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const next = routes[(index + step + routes.length) % routes.length]!;
    setChosen(next.id);
    document.getElementById(`fund-route-${agent}-${next.id}`)?.focus();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor={`fund-agent-amount-${agent}`}
          className="text-[14px] font-medium text-[var(--ink)]"
        >
          {copy.amount.label}
        </label>
        <div
          className="flex min-h-[52px] items-center gap-3 rounded-[14px] bg-[var(--tint)] px-4"
        >
          <input
            id={`fund-agent-amount-${agent}`}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            disabled={fundingBusy}
            aria-describedby={`fund-agent-amount-note-${agent}`}
            className="min-h-[52px] min-w-0 flex-1 rounded-[14px] bg-transparent text-[16px] font-medium tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--ink-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--action)]"
          />
          <span className="text-[14px] text-[var(--ink-secondary)] font-medium">
            USDC
          </span>
        </div>
        <p id={`fund-agent-amount-note-${agent}`} className="text-[14px] leading-snug text-[var(--ink-secondary)] font-medium">
          {inPlaceUsdc === undefined ? copy.amount.note : copy.amount.shortNote}
        </p>
        {amountInput.trim() !== '' && !validAmount && (
          <p className="text-[14px] leading-snug text-[var(--color-critical)]">
            {copy.amount.invalid}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p id={`fund-from-${agent}`} className="text-[14px] font-medium text-[var(--ink)]">
          {copy.eyebrow}
        </p>
        <div role="radiogroup" aria-labelledby={`fund-from-${agent}`} className="divide-y divide-[var(--line)] overflow-hidden rounded-[14px] border border-[var(--line)]">
          {routes.map((option, index) => {
            const active = route === option.id;
            return (
              <button
                key={option.id}
                id={`fund-route-${agent}-${option.id}`}
                type="button"
                role="radio"
                aria-checked={active}
                aria-labelledby={`fund-route-${agent}-${option.id}-label`}
                aria-describedby={`fund-route-${agent}-${option.id}-detail`}
                tabIndex={active ? 0 : -1}
                onClick={() => { if (!fundingBusy) setChosen(option.id); }}
                onKeyDown={(event) => { if (!fundingBusy) onArrow(event, index); }}
                /* aria-disabled, not disabled: while money moves the chosen source
                   stays focusable, so the sheet never has nothing to focus. */
                aria-disabled={fundingBusy}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3 text-start transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none aria-disabled:opacity-60',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--action)]',
                  active ? 'bg-[var(--tint)]' : 'hover:bg-[var(--tint)]',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2',
                    active ? 'border-[var(--ink)]' : 'border-[var(--line)]',
                  )}
                >
                  {active ? <span className="size-2.5 rounded-full bg-[var(--ink)]" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span id={`fund-route-${agent}-${option.id}-label`} className="text-[15px] font-medium text-[var(--ink)]">{option.label}</span>
                    {option.balance ? <span className="shrink-0 text-[14px] font-medium tabular-nums text-[var(--ink-secondary)]">{option.balance}</span> : null}
                  </span>
                  <span id={`fund-route-${agent}-${option.id}-detail`} className="mt-0.5 block text-[14px] leading-snug text-[var(--ink-secondary)]">{option.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {route === 'wallet' && circleAccount && validAmount && (
        <FundAgentFromBalance agent={agent} amountUsdc={fundingAmount} onFunded={onFunded} onBusyChange={reportBusy} />
      )}
      {route === 'wallet' && !circleAccount && recipient && validAmount && (
        <FundAgentFromWallet
          agent={agent}
          recipient={recipient}
          amountUsdc={fundingAmount}
          onFunded={onFunded}
          onBusyChange={reportBusy}
        />
      )}
      {/* The Circle path is the only one that needs no wallet at all, so say so
          once, under the action it applies to. */}
      {!circleAccount && route === 'wallet' && (
        <p className="text-[14px] leading-snug text-[var(--ink-secondary)] font-medium">{copy.wallet.web3Note}</p>
      )}
      {route === 'otherAgent' && otherAgentAddress && recipient && validAmount && (
        <MoveFromOtherAgent
          from={agent === 'buyer' ? 'seller' : 'buyer'}
          toAddress={recipient}
          amountUsdc={fundingAmount}
          onFunded={onFunded}
          onBusyChange={reportBusy}
        />
      )}
      {route === 'chain' && recipient && validAmount && (
        <TopUpFromGateway recipient={recipient} amount={fundingAmount} onFunded={onFunded} onBusyChange={reportBusy} primary />
      )}
      {route === 'chain' && (
        <FundGatewayCallout label={copy.chain.cta} note={copy.chain.note} rail="cctp" />
      )}
    </div>
  );
}

/// Move USDC from the account's other agent wallet into the one that is short.
/// Both wallets belong to the same person, so this is a transfer between their
/// own pockets, not a payment.
function MoveFromOtherAgent({
  from,
  toAddress,
  amountUsdc,
  onFunded,
  onBusyChange,
}: {
  from: 'buyer' | 'seller';
  toAddress: string;
  amountUsdc: number;
  onFunded?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { address } = useAuth();
  const copy = useTranslations().fundAgentOptions;
  const [state, setState] = useState<'idle' | 'moving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onBusyChange?.(state === 'moving');
    return () => onBusyChange?.(false);
  }, [onBusyChange, state]);

  async function move() {
    if (!address) return;
    setState('moving');
    setError(null);
    try {
      await api.withdrawFromAgent({
        address,
        agent: from,
        toAddress,
        amountUsdc,
        requestId: `agent-move-${from}-${toAddress}-${amountUsdc}`,
      });
      setState('done');
      onFunded?.();
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : copy.moveFailed);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={move}
        disabled={state !== 'idle'}
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--action)] px-5 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
      >
        {state === 'moving'
          ? copy.moving
          : state === 'done'
            ? copy.moved
            : copy.moveCta.replace('{amount}', String(amountUsdc))}
      </button>
      {error && (
        <p className="text-[14px] leading-snug text-[var(--color-critical)]">
          {error}
        </p>
      )}
    </div>
  );
}

/// The way out when the chosen source is empty: the page that fills it, on the
/// rail this tile names. Both callouts used to land on the pooled rail, so
/// "another chain" sent the reader to the wrong panel and they had to find the
/// transfer themselves.
function FundGatewayCallout({
  label,
  note,
  rail,
}: {
  label: string;
  note: string;
  rail: 'gateway' | 'cctp';
}) {
  return (
    <div className="space-y-2">
      <p className="text-[14px] leading-snug text-[var(--ink-secondary)] font-medium">{note}</p>
      <a
        href={`/bridge?rail=${rail}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--tint)] px-5 text-[15px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
      >
        {label}
        <Icon name="arrow-up-right" size={16} directional />
      </a>
    </div>
  );
}
