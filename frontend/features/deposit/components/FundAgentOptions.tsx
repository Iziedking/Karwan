'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Hint } from '@/shared/components/Hint';
import { cn } from '@/shared/utils/cn';
import { Icon } from '@/shared/components/Icon';
import { FundAgentFromBalance } from './FundAgentFromBalance';
import { FundAgentFromWallet } from './FundAgentFromWallet';
import { TopUpFromGateway } from '@/features/gateway/TopUpFromGateway';

/// Where the money comes from, as a choice.
///
/// The agent being short of USDC used to pick a route FOR the user: the Circle
/// path for an email account, the pooled path for a web3 account, and a link to
/// the bridge for everyone else. One route, no explanation, and no way to reach
/// the money that was sitting somewhere else.
///
/// A bank asks which account to pay from. So does this: four routes, each an
/// icon and a short label with its explanation a tap away, and the action for
/// the chosen one appears underneath. Nothing here moves money on its own; each
/// route is the component that already owns that movement, including its own
/// balance check and its own error.
export type FundRoute = 'wallet' | 'otherAgent' | 'gateway' | 'chain';

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
  circleAccount: boolean;
  onFunded?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const copy = useTranslations().fundAgentOptions;
  const [route, setRoute] = useState<FundRoute | null>(null);
  const [amountInput, setAmountInput] = useState(() => String(amountUsdc));
  const [fundingBusy, setFundingBusy] = useState(false);
  const reportBusy = useCallback((busy: boolean) => {
    setFundingBusy(busy);
    onBusyChange?.(busy);
  }, [onBusyChange]);

  useEffect(() => {
    setAmountInput(String(amountUsdc));
  }, [amountUsdc]);

  const parsedAmount = Number(amountInput);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const fundingAmount = validAmount ? parsedAmount : 0;

  const routes: Array<{ id: FundRoute; label: string; tooltip: string }> = [
    { id: 'wallet', label: copy.wallet.label, tooltip: copy.wallet.tooltip },
    ...(otherAgentAddress && recipient
      ? [
          {
            id: 'otherAgent' as const,
            label: agent === 'buyer' ? copy.otherAgent.labelSeller : copy.otherAgent.labelBuyer,
            tooltip: copy.otherAgent.tooltip,
          },
        ]
      : []),
    { id: 'gateway', label: copy.gateway.label, tooltip: copy.gateway.tooltip },
    { id: 'chain', label: copy.chain.label, tooltip: copy.chain.tooltip },
  ];

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--ink-secondary)]">
        {copy.eyebrow}
      </p>

      <div className="space-y-1.5">
        <label
          htmlFor={`fund-agent-amount-${agent}`}
          className="text-[13px] font-medium text-[var(--ink)]"
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
          <span className="text-[13px] text-[var(--ink-secondary)]">
            USDC
          </span>
        </div>
        <p id={`fund-agent-amount-note-${agent}`} className="text-[13px] leading-snug text-[var(--ink-secondary)]">
          {copy.amount.note}
        </p>
        {amountInput.trim() !== '' && !validAmount && (
          <p className="text-[13px] leading-snug text-[var(--color-critical)]">
            {copy.amount.invalid}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {routes.map((option) => {
          const active = route === option.id;
          return (
            <div key={option.id} className="relative">
              <button
                type="button"
                onClick={() => setRoute(active ? null : option.id)}
                disabled={fundingBusy}
                aria-pressed={active}
                className={cn(
                  'flex min-h-12 w-full items-center rounded-full py-3 ps-4 pe-12 text-start text-[14px] font-medium transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]',
                  active
                    ? 'bg-[var(--ink)] text-[var(--canvas)]'
                    : 'bg-[var(--tint)] text-[var(--ink)] hover:bg-[var(--line)]',
                )}
              >
                {option.label}
              </button>
              {/* The explanation, one tap away, out of the button so pressing it
                  chooses the route rather than opening the tooltip. */}
              <span className="absolute end-2 top-1/2 -translate-y-1/2">
                <Hint side="bottom" align="end">
                  {option.tooltip}
                </Hint>
              </span>
            </div>
          );
        })}
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
      {route === 'otherAgent' && otherAgentAddress && recipient && validAmount && (
        <MoveFromOtherAgent
          from={agent === 'buyer' ? 'seller' : 'buyer'}
          toAddress={recipient}
          amountUsdc={fundingAmount}
          onFunded={onFunded}
          onBusyChange={reportBusy}
        />
      )}
      {route === 'gateway' && recipient && validAmount && (
        <TopUpFromGateway recipient={recipient} amount={fundingAmount} onFunded={onFunded} onBusyChange={reportBusy} primary />
      )}
      {route === 'gateway' && !recipient && (
        <FundGatewayCallout
          label={copy.gateway.fundCta}
          note={copy.gateway.noRecipient}
          rail="gateway"
        />
      )}
      {route === 'chain' && (
        <FundGatewayCallout label={copy.chain.cta} note={copy.chain.note} rail="cctp" />
      )}

      {/* The Circle path is the only one that needs no wallet at all, so say so
          once rather than repeating it in four tooltips. */}
      {!circleAccount && route === 'wallet' && (
        <p className="text-[13px] leading-snug text-[var(--ink-secondary)]">{copy.wallet.web3Note}</p>
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
        <p className="text-[13px] leading-snug text-[var(--color-critical)]">
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
      <p className="text-[13px] leading-snug text-[var(--ink-secondary)]">{note}</p>
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
