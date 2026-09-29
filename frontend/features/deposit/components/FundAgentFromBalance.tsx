'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { chainErrorMessage } from '@/shared/utils/chainError';
import { useMoneyRefresh } from '@/shared/hooks/useMoneyRefresh';

/// One click to fund the agent that is short, from the balance the user has.
///
/// The existing button funded from the Gateway pooled balance, and fell back to
/// opening the Gateway rail in a new tab when the pool could not cover it. Two
/// problems with that for an email account: the pool is a separate address most
/// of them have never funded, and the rail is the plumbing the deposit work
/// exists to keep off their screen.
///
/// The money is already in the user's confirmed pooled balance. Funding an
/// agent is one session-scoped Gateway spend to Arc, with no bridge, no chain
/// to pick and no wallet signature prompt.
export function FundAgentFromBalance({
  agent,
  amountUsdc,
  onFunded,
  onBusyChange,
}: {
  agent: 'buyer' | 'seller';
  amountUsdc: number;
  onFunded?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { address } = useAuth();
  const t = useTranslations().gatewayTopUp;
  const errCopy = useTranslations().chainErrors;
  const fallback = useTranslations().chainErrors.generic;
  const refreshMoney = useMoneyRefresh();
  const [phase, setPhase] = useState<'idle' | 'moving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    onBusyChange?.(phase === 'moving');
    return () => onBusyChange?.(false);
  }, [onBusyChange, phase]);

  async function run() {
    if (!address || phase === 'moving') return;
    setPhase('moving');
    setError(null);
    try {
      requestIdRef.current ??= crypto.randomUUID();
      await api.gatewayFundAgent(agent, amountUsdc, requestIdRef.current);
      requestIdRef.current = null;
      setPhase('done');
      refreshMoney();
      onFunded?.();
    } catch (err) {
      // Never the raw error. The usual cause is the identity wallet being short,
      // which is a sentence, not a revert string.
      setError(chainErrorMessage(err, errCopy, fallback));
      setPhase('error');
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={run}
        disabled={phase === 'moving' || phase === 'done'}
        aria-busy={phase === 'moving'}
        className="inline-flex min-h-12 items-center gap-2 rounded-full px-5 py-3 text-[15px] font-medium transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
        style={{
          background: phase === 'done' ? 'var(--ink)' : 'var(--action)',
          color: phase === 'done' ? 'var(--canvas)' : 'var(--on-action)',
          borderRadius: 999,
        }}
      >
        {phase === 'moving' ? t.moving : phase === 'done' ? t.done : t.fundPool}
      </button>
      {error ? (
        <p className="text-[13px] leading-snug text-[var(--color-critical)]">{error}</p>
      ) : null}
    </div>
  );
}
