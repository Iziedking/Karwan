'use client';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc } from '@/shared/utils/format';
import { useGatewayBalance } from './useGatewayBalance';
import { gatewaySpend, openGatewayRail } from './lib';
import { GatewayProgress, type StepMap } from './GatewayProgress';
import { gatewayTopUpErrorPresentation } from './errorPresentation';

/// Fund an Arc address straight from the pooled Gateway balance. One signature,
/// no gas on any chain, and the recipient can be a Circle agent SCA because
/// Gateway only rejects SCAs as SIGNERS, not as recipients.
///
/// When the pool cannot cover the amount the button does NOT try and fail: it
/// opens the Gateway rail in a new tab so the user can pool from any chain,
/// leaving the page they were on (a half-filled job form, a live deal) intact.
///
/// Pass `amount` when the context knows the figure (a job budget, a deal
/// shortfall). Omit it on a wallets panel, where the user picks.
export function TopUpFromGateway({
  recipient,
  agent,
  amount,
  onFunded,
  onBusyChange,
  primary = false,
}: {
  /// Arc address to credit. An agent SCA is fine.
  recipient: string;
  /// When supplied, use Karwan's session-scoped pooled-balance funding route.
  /// This keeps Circle accounts and disconnected wallet sessions out of the
  /// wallet-signer Gateway rail while preserving the generic recipient flow.
  agent?: 'buyer' | 'seller';
  /// USDC to move. Omit to let the user type it.
  amount?: number;
  onFunded?: () => void;
  onBusyChange?: (busy: boolean) => void;
  /// The enclosing funding chooser owns its primary action. Profile keeps
  /// this secondary beside its existing wallet transfer.
  primary?: boolean;
}) {
  const t = useTranslations().gatewayTopUp;
  const amountLabel = useTranslations().fundAgentOptions.amount.label;
  const errCopy = useTranslations().chainErrors;
  const auth = useAuth();
  const { connector, isConnected } = useAccount();
  const { confirmed, loading, refresh } = useGatewayBalance();
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<'idle' | 'moving' | 'done' | 'error'>('idle');
  const [steps, setSteps] = useState<StepMap>({});
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    onBusyChange?.(phase === 'moving');
    return () => onBusyChange?.(false);
  }, [onBusyChange, phase]);

  const asks = amount == null;
  const value = asks ? Number(typed) : amount;
  const valid = Number.isFinite(value) && value > 0;
  const covers = valid && confirmed >= value;

  async function run() {
    // A selected agent is a first-party destination. Use the session-scoped
    // backend route so Circle accounts and disconnected web3 sessions can
    // spend an already-confirmed pooled balance without opening the Gateway
    // rail or asking for an unrelated wallet signature.
    if (covers && agent && auth.address) {
      setError(null);
      setPhase('moving');
      setSteps({});
      try {
        requestIdRef.current ??= crypto.randomUUID();
        await api.gatewayFundAgent(agent, value, requestIdRef.current);
        requestIdRef.current = null;
        await refresh();
        setPhase('done');
        setTyped('');
        onFunded?.();
      } catch (err) {
        setPhase('error');
        const failure = gatewayTopUpErrorPresentation({
          err,
          confirmed,
          amount: value,
          chainCopy: errCopy,
          fallback: t.failed,
          feePreparationFailed: t.feePreparationFailed,
        });
        setError(failure.message);
        if (failure.refreshBalance) await refresh();
      }
      return;
    }

    // Not enough pooled balance, or no first-party agent context: send the
    // user to the rail rather than pretend the generic wallet path can finish.
    if (!covers || !isConnected || !connector) {
      openGatewayRail();
      return;
    }
    setError(null);
    setPhase('moving');
    setSteps({});
    try {
      const provider = await connector.getProvider();
      if (!provider) throw new Error('Wallet provider unavailable');
      await gatewaySpend({
        provider,
        amount: String(value),
        recipientAddress: recipient,
        // Funding an agent is the same spend as a move, so it gets the same
        // stages. The forwarder mint is the long part; it should not be silent
        // just because this button is small.
        onStep: (name, step) => setSteps((prev) => ({ ...prev, [name]: step })),
      });
      await refresh();
      setPhase('done');
      setTyped('');
      onFunded?.();
    } catch (err) {
      setPhase('error');
      const failure = gatewayTopUpErrorPresentation({
        err,
        confirmed,
        amount: value,
        chainCopy: errCopy,
        fallback: t.failed,
        feePreparationFailed: t.feePreparationFailed,
      });
      setError(failure.message);
      // A failed estimate can race Gateway's indexed balance. Refresh the
      // read-side figure, but never resubmit or open another wallet prompt.
      if (failure.refreshBalance) await refresh();
    }
  }

  const label =
    phase === 'moving'
      ? t.moving
      : phase === 'done'
        ? t.done
        : covers
          ? t.cta
          : t.fundPool;

  return (
    <div className="min-w-0 space-y-2">
      <div
        className={
          asks
            ? 'grid min-w-0 grid-cols-1 items-center gap-2 min-[390px]:grid-cols-[92px_minmax(0,1fr)]'
            : 'flex min-w-0 items-center'
        }
      >
        {asks && (
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={phase === 'moving'}
            placeholder="0.00"
            aria-label={amountLabel}
            className="min-h-[52px] w-full min-w-0 rounded-[14px] bg-[var(--tint)] px-4 text-[16px] tabular-nums text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] disabled:opacity-50"
          />
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={phase === 'moving' || loading}
          aria-busy={phase === 'moving'}
          className="min-h-12 w-full min-w-0 rounded-full px-5 py-3 text-[15px] font-medium leading-tight transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
          style={{
            background: primary ? 'var(--action)' : 'var(--tint)',
            color: primary ? 'var(--on-action)' : 'var(--ink)',
          }}
        >
          {label}
        </button>
      </div>

      {!loading && (
        <p className="text-[13px] text-[var(--ink-secondary)]">
          {covers || !valid
            ? t.availableTemplate.replace(
                '{amount}',
                formatUsdc(String(confirmed), { withSuffix: false }),
              )
            : t.shortTemplate
                .replace('{have}', formatUsdc(String(confirmed), { withSuffix: false }))
                .replace('{need}', formatUsdc(String(value), { withSuffix: false }))}
        </p>
      )}

      {(phase === 'moving' || phase === 'done') && <GatewayProgress steps={steps} />}

      {phase === 'error' && <p className="text-[13px] text-[var(--color-critical)]">{error ?? t.failed}</p>}
    </div>
  );
}
