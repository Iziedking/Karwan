'use client';
import { useRef, useState } from 'react';
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
/// The money is already in the right place. Deposits auto-route to the Arc
/// identity wallet, so funding an agent is one backend-signed transfer on Arc,
/// with no bridge, no chain to pick and no signature prompt.
export function FundAgentFromBalance({
  agent,
  amountUsdc,
  onFunded,
}: {
  agent: 'buyer' | 'seller';
  amountUsdc: number;
  onFunded?: () => void;
}) {
  const { address } = useAuth();
  const t = useTranslations().gatewayTopUp;
  const errCopy = useTranslations().chainErrors;
  const fallback = useTranslations().chainErrors.generic;
  const refreshMoney = useMoneyRefresh();
  const [phase, setPhase] = useState<'idle' | 'moving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  async function run() {
    if (!address || phase === 'moving') return;
    setPhase('moving');
    setError(null);
    try {
      requestIdRef.current ??= crypto.randomUUID();
      await api.fundAgent({ address, agent, amountUsdc, requestId: requestIdRef.current });
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
        className="inline-flex items-center gap-2 px-4 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors disabled:opacity-60"
        style={{
          background: phase === 'done' ? 'var(--lp-band-dark)' : 'var(--lp-accent)',
          color: phase === 'done' ? 'white' : 'var(--lp-dark)',
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 2,
        }}
      >
        {phase === 'moving' ? t.moving : phase === 'done' ? t.done : t.fundPool}
      </button>
      {error ? (
        <p className="mono text-[11px] leading-snug text-[#7a1f1a]">{error}</p>
      ) : null}
    </div>
  );
}
