'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Hint } from '@/shared/components/Hint';
import { cn } from '@/shared/utils/cn';
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
}: {
  agent: 'buyer' | 'seller';
  otherAgentAddress?: string | null;
  recipient?: string | null;
  amountUsdc: number;
  circleAccount: boolean;
  onFunded?: () => void;
}) {
  const copy = useTranslations().fundAgentOptions;
  const [route, setRoute] = useState<FundRoute | null>(null);
  const [amountInput, setAmountInput] = useState(() => String(amountUsdc));

  useEffect(() => {
    setAmountInput(String(amountUsdc));
  }, [amountUsdc]);

  const parsedAmount = Number(amountInput);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const fundingAmount = validAmount ? parsedAmount : 0;

  const routes: Array<{ id: FundRoute; label: string; tooltip: string; icon: ReactNode }> = [
    { id: 'wallet', label: copy.wallet.label, tooltip: copy.wallet.tooltip, icon: <WalletGlyph /> },
    ...(otherAgentAddress && recipient
      ? [
          {
            id: 'otherAgent' as const,
            label: agent === 'buyer' ? copy.otherAgent.labelSeller : copy.otherAgent.labelBuyer,
            tooltip: copy.otherAgent.tooltip,
            icon: <AgentGlyph />,
          },
        ]
      : []),
    { id: 'gateway', label: copy.gateway.label, tooltip: copy.gateway.tooltip, icon: <PoolGlyph /> },
    { id: 'chain', label: copy.chain.label, tooltip: copy.chain.tooltip, icon: <ChainGlyph /> },
  ];

  return (
    <div className="space-y-3">
      <p className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        [:{copy.eyebrow}:]
      </p>

      <div className="space-y-1.5">
        <label
          htmlFor={`fund-agent-amount-${agent}`}
          className="mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--lp-text-muted)]"
        >
          {copy.amount.label}
        </label>
        <div
          className="flex min-h-11 items-center gap-3 px-3"
          style={{
            background: 'var(--lp-card)',
            border: '1px solid var(--lp-border-light)',
            borderRadius: 10,
          }}
        >
          <input
            id={`fund-agent-amount-${agent}`}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
            aria-describedby={`fund-agent-amount-note-${agent}`}
            className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold tabular-nums text-[var(--lp-dark)] outline-none placeholder:text-[var(--lp-text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          />
          <span className="mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            USDC
          </span>
        </div>
        <p id={`fund-agent-amount-note-${agent}`} className="text-[12px] leading-snug text-[var(--lp-text-muted)]">
          {copy.amount.note}
        </p>
        {amountInput.trim() !== '' && !validAmount && (
          <p className="border-s-2 border-[var(--lp-critical)] ps-2 text-[12px] leading-snug text-[var(--lp-critical)]">
            {copy.amount.invalid}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {routes.map((option) => {
          const active = route === option.id;
          return (
            <div key={option.id} className="relative">
              <button
                type="button"
                onClick={() => setRoute(active ? null : option.id)}
                aria-pressed={active}
                className={cn(
                  'group flex h-full w-full flex-col items-start gap-2 p-3 text-start transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                  active
                    ? 'bg-[color-mix(in_oklab,var(--lp-accent)_12%,transparent)] border-[color-mix(in_oklab,var(--lp-accent)_40%,transparent)]'
                    : 'bg-[var(--lp-card)] border-[var(--lp-border-light)] hover:border-[var(--lp-text-muted)]',
                )}
                style={{
                  border: '1px solid',
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              >
                <span
                  aria-hidden
                  className="transition-colors"
                  style={{ color: active ? 'var(--lp-dark)' : 'var(--lp-text-sub)' }}
                >
                  {option.icon}
                </span>
                <span
                  className="mono text-[10px] font-bold uppercase leading-tight tracking-[0.1em]"
                  style={{ color: active ? 'var(--lp-dark)' : 'var(--lp-text-sub)' }}
                >
                  {option.label}
                </span>
              </button>
              {/* The explanation, one tap away, out of the button so pressing it
                  chooses the route rather than opening the tooltip. */}
              <span className="absolute end-2 top-2">
                <Hint side="bottom" align="end">
                  {option.tooltip}
                </Hint>
              </span>
            </div>
          );
        })}
      </div>

      {route === 'wallet' && circleAccount && validAmount && (
        <FundAgentFromBalance agent={agent} amountUsdc={fundingAmount} onFunded={onFunded} />
      )}
      {route === 'wallet' && !circleAccount && recipient && validAmount && (
        <FundAgentFromWallet
          agent={agent}
          recipient={recipient}
          amountUsdc={fundingAmount}
          onFunded={onFunded}
        />
      )}
      {route === 'otherAgent' && otherAgentAddress && recipient && validAmount && (
        <MoveFromOtherAgent
          from={agent === 'buyer' ? 'seller' : 'buyer'}
          toAddress={recipient}
          amountUsdc={fundingAmount}
          onFunded={onFunded}
        />
      )}
      {route === 'gateway' && recipient && validAmount && (
        <TopUpFromGateway recipient={recipient} amount={fundingAmount} onFunded={onFunded} />
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
        <p className="text-[12px] leading-snug text-[var(--lp-text-muted)]">{copy.wallet.web3Note}</p>
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
}: {
  from: 'buyer' | 'seller';
  toAddress: string;
  amountUsdc: number;
  onFunded?: () => void;
}) {
  const { address } = useAuth();
  const copy = useTranslations().fundAgentOptions;
  const [state, setState] = useState<'idle' | 'moving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

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
        className="inline-flex min-h-11 items-center gap-2 bg-[var(--lp-accent)] px-4 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-ink)] transition-opacity hover:bg-[var(--lp-accent-hover)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        style={{
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 3,
        }}
      >
        {state === 'moving'
          ? copy.moving
          : state === 'done'
            ? copy.moved
            : copy.moveCta.replace('{amount}', String(amountUsdc))}
      </button>
      {error && (
        <p className="border-s-2 border-[var(--lp-critical)] ps-2 text-[12px] leading-snug text-[var(--lp-critical)]">
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
      <p className="text-[12px] leading-snug text-[var(--lp-text-sub)]">{note}</p>
      <a
        href={`/bridge?rail=${rail}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 border border-[var(--lp-outline-strong)] px-4 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-dark)] transition-colors hover:border-[var(--lp-outline-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        style={{
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 3,
        }}
      >
        {label}
        <span aria-hidden>↗</span>
      </a>
    </div>
  );
}

/* ---- glyphs. line drawings at 1.5 stroke, drawn for these four routes rather
   than pulled from an icon set, so the row reads as one family. ---- */

function WalletGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="14.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

function AgentGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="8" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="4" r="1.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 12.5h.01M14.5 12.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9.5 15.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PoolGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 4 21 8l-9 4-9-4 9-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 12l9 4 9-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 16l9 4 9-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ChainGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="9" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="9" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.4 10.6 14 12.5l-1.6 1.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
