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
}: {
  agent: 'buyer' | 'seller';
  recipient: string;
  amountUsdc: number;
  onFunded?: () => void;
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

  if (!validRecipient) {
    return <p className="text-[12px] leading-snug text-[var(--lp-critical)]">{copy.recipient.notConfigured}</p>;
  }
  const destination = validRecipient;

  const busy = latest?.phase === 'switching' || latest?.phase === 'signing' || latest?.phase === 'confirming';
  const settling = latest?.phase === 'unconfirmed' || latest?.phase === 'settling';
  const completed = latest?.phase === 'done';
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
        className="inline-flex min-h-11 items-center gap-2 bg-[var(--lp-accent)] px-4 mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-ink)] transition-opacity hover:bg-[var(--lp-accent-hover)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        style={{
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 3,
        }}
      >
        {label}
      </button>
      {latest?.error && latest.phase === 'error' ? (
        <p className="mono text-[11px] leading-snug text-[var(--lp-critical)]">{latest.error}</p>
      ) : null}
      {settling ? (
        <p className="text-[12px] leading-snug text-[var(--lp-text-muted)]">{copy.submit.activeNote}</p>
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
