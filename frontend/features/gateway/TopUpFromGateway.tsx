'use client';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatUsdc } from '@/shared/utils/format';
import { useGatewayBalance } from './useGatewayBalance';
import { gatewaySpend, openGatewayRail } from './lib';

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
  amount,
  onFunded,
}: {
  /// Arc address to credit. An agent SCA is fine.
  recipient: string;
  /// USDC to move. Omit to let the user type it.
  amount?: number;
  onFunded?: () => void;
}) {
  const t = useTranslations().gatewayTopUp;
  const { connector, isConnected } = useAccount();
  const { confirmed, loading, refresh } = useGatewayBalance();
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<'idle' | 'moving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const asks = amount == null;
  const value = asks ? Number(typed) : amount;
  const valid = Number.isFinite(value) && value > 0;
  const covers = valid && confirmed >= value;

  async function run() {
    // Not enough pooled, no wallet, or nothing typed yet: send them to the rail
    // rather than fail. Only an EOA can sign a spend, so a missing wallet lands
    // here too.
    if (!covers || !isConnected || !connector) {
      openGatewayRail();
      return;
    }
    setError(null);
    setPhase('moving');
    try {
      const provider = await connector.getProvider();
      if (!provider) throw new Error('Wallet provider unavailable');
      await gatewaySpend({
        provider,
        amount: String(value),
        recipientAddress: recipient,
      });
      await refresh();
      setPhase('done');
      setTyped('');
      onFunded?.();
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : t.failed);
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
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
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
            className="w-[92px] px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-[var(--lp-accent)] disabled:opacity-50"
            style={{
              background: 'var(--lp-light)',
              border: '1px solid var(--lp-border-light)',
              borderRadius: 8,
            }}
          />
        )}
        <button
          type="button"
          onClick={() => void run()}
          disabled={phase === 'moving' || loading}
          className="mono text-[11px] font-bold uppercase tracking-[0.1em] px-4 py-2 transition-opacity disabled:opacity-50"
          style={{
            background: covers ? 'var(--lp-accent)' : 'transparent',
            color: 'var(--lp-dark)',
            border: `1px solid ${covers ? 'var(--lp-accent)' : 'var(--lp-border-light)'}`,
            borderRadius: 999,
          }}
        >
          {label}
        </button>
      </div>

      {!loading && (
        <p className="text-[12px] text-[var(--lp-text-sub)]">
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

      {phase === 'error' && <p className="text-[12px] text-[#b03d3a]">{error ?? t.failed}</p>}
    </div>
  );
}
