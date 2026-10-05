'use client';

import { useEffect, useMemo, useRef } from 'react';
import { isAddress } from 'viem';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useArcFund, type FundPhase } from '@/features/profile/hooks/useArcFund';

/// Fund an agent from the connected Arc wallet. This is deliberately separate
/// from FundAgentFromBalance: that component calls the Circle identity-wallet
/// route, while a browser wallet must sign its own ERC-20 transfer.
export function FundAgentFromWallet({
  agent,
  recipient,
  amountUsdc,
  onFunded,
  onBusyChange,
}: {
  agent: 'buyer' | 'seller';
  recipient: string;
  amountUsdc: number;
  onFunded?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const copy = useTranslations().arcFundCard;
  const { records, start, retry } = useArcFund();
  const notifiedRef = useRef<string | null>(null);
  const validRecipient = isAddress(recipient) ? (recipient as `0x${string}`) : null;

  const latest = useMemo(
    () =>
      validRecipient
        ? records.find(
            (record) =>
              record.agentKey === agent &&
              record.agentAddress.toLowerCase() === validRecipient.toLowerCase() &&
              record.amountUsdc === amountUsdc.toString(),
          )
        : undefined,
    [agent, amountUsdc, records, validRecipient],
  );

  useEffect(() => {
    if (!latest || latest.phase !== 'done' || notifiedRef.current === latest.id) return;
    notifiedRef.current = latest.id;
    onFunded?.();
  }, [latest, onFunded]);

  const busy = latest?.phase === 'switching' || latest?.phase === 'signing' || latest?.phase === 'confirming';
  const settling = latest?.phase === 'unconfirmed' || latest?.phase === 'settling';
  const completed = latest?.phase === 'done';

  useEffect(() => {
    onBusyChange?.(busy || settling);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange, settling]);

  if (!validRecipient) {
    return <p className="text-[14px] leading-snug text-[var(--color-critical)]">{copy.recipient.notConfigured}</p>;
  }
  const destination = validRecipient;

  const label = latest ? phaseLabel(latest.phase, copy) : copy.submit.sendToTemplate.replace(
    '{label}',
    agent === 'buyer' ? copy.agentBuyerLabel : copy.agentSellerLabel,
  );

  async function run() {
    if (busy || settling || completed) return;
    if (latest?.phase === 'error') {
      await retry(latest.id);
      return;
    }
    await start({ agentKey: agent, agentAddress: destination, amountUsdc });
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || settling || completed}
        aria-busy={busy}
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--action)] px-5 py-3 text-[15px] font-medium text-[var(--on-action)] transition-opacity duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]"
      >
        {label}
      </button>
      {latest?.error && latest.phase === 'error' ? (
        <p className="text-[14px] leading-snug text-[var(--color-critical)]">{latest.error}</p>
      ) : null}
      {settling ? (
        <p className="text-[14px] leading-snug text-[var(--ink-secondary)] font-medium">{copy.submit.activeNote}</p>
      ) : null}
    </div>
  );
}

function phaseLabel(
  phase: FundPhase,
  copy: ReturnType<typeof useTranslations>['arcFundCard'],
): string {
  switch (phase) {
    case 'switching':
      return copy.phase.switching;
    case 'signing':
      return copy.phase.signing;
    case 'confirming':
      return copy.phase.confirming;
    case 'unconfirmed':
      return copy.phase.unconfirmed;
    case 'settling':
      return copy.phase.settling;
    case 'done':
      return copy.phase.done;
    case 'error':
      return copy.row.retry;
  }
}
