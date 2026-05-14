'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { api, ApiError } from '@/core/api';
import { Hint } from '@/shared/components/Hint';
import { feeBreakdown } from '../config';
import { formatUsdc } from '@/shared/utils/format';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function DirectDealForm() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [seller, setSeller] = useState('');
  const [amount, setAmount] = useState<number | ''>(100);
  const [days, setDays] = useState<number | ''>(7);
  const [firstPct, setFirstPct] = useState<number | ''>(20);
  const [terms, setTerms] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sellerValid = ADDR_RE.test(seller.trim());
  const sameWallet =
    sellerValid && address && seller.trim().toLowerCase() === address.toLowerCase();
  const amountValid = typeof amount === 'number' && amount > 0;
  const daysValid = typeof days === 'number' && days >= 1 && days <= 180;
  const pctValid = typeof firstPct === 'number' && firstPct >= 1 && firstPct <= 99;
  const termsValid = terms.trim().length > 0;

  const canSubmit =
    isConnected &&
    sellerValid &&
    !sameWallet &&
    amountValid &&
    daysValid &&
    pctValid &&
    termsValid &&
    !submitting;

  const fee = amountValid ? feeBreakdown(amount as number) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.createDirectDeal({
        buyerAddress: address,
        sellerAddress: seller.trim(),
        dealAmountUsdc: amount as number,
        deadlineDays: days as number,
        terms: terms.trim(),
        firstReleasePct: firstPct as number,
      });
      router.push(`/deals/${r.deal.jobId}`);
    } catch (err) {
      if (err instanceof ApiError && err.detail) setError(String(err.detail));
      else setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--color-ink-dim)]">
          Connect your wallet to open a direct deal.
        </p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block space-y-1.5">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
          Seller wallet address
          <Hint>
            The wallet your counterparty gave you. They sign in with this same wallet to see
            the deal and mark it delivered.
          </Hint>
        </span>
        <input
          type="text"
          value={seller}
          onChange={(e) => setSeller(e.target.value)}
          placeholder="0x…"
          disabled={submitting}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-60"
        />
        {seller.length > 0 && !sellerValid && (
          <span className="text-[11px] text-[var(--color-critical)]">
            Not a valid 20-byte address.
          </span>
        )}
        {sameWallet && (
          <span className="text-[11px] text-[var(--color-critical)]">
            Seller must be a different wallet from yours.
          </span>
        )}
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            Amount (USDC)
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={amount}
            disabled={submitting}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            className="no-spinner w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-60"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            Deadline (days)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={180}
            step={1}
            value={days}
            disabled={submitting}
            onChange={(e) => setDays(e.target.value === '' ? '' : Number(e.target.value))}
            className="no-spinner w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-60"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
            On delivery (%)
            <Hint>
              The slice the seller receives the moment they mark the work delivered. The rest
              releases when you verify. A 20 here means 20% on delivery, 80% on your sign-off.
            </Hint>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            step={1}
            value={firstPct}
            disabled={submitting}
            onChange={(e) => setFirstPct(e.target.value === '' ? '' : Number(e.target.value))}
            className="no-spinner w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm mono focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-60"
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
          Terms
          <Hint>
            What is being delivered and the conditions for release. Both parties see this on
            the deal page.
          </Hint>
        </span>
        <textarea
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={3}
          disabled={submitting}
          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-[var(--color-ink)] resize-none disabled:opacity-60"
        />
      </label>

      {fee && (
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3 space-y-1.5">
          <p className="eyebrow">Funding breakdown · 1.5% fee, split evenly</p>
          <FeeLine label="You fund" value={fee.fundedAmount} strong />
          <FeeLine label="Seller receives" value={fee.sellerNet} />
          <FeeLine label="Platform fee" value={fee.feeTotal} faint />
          {typeof firstPct === 'number' && pctValid && (
            <p className="text-[11px] text-[var(--color-ink-faint)] pt-1 border-t border-[var(--color-line)] mt-1.5">
              Released {firstPct}% on delivery · {100 - firstPct}% on your verification
            </p>
          )}
          <p className="text-[11px] text-[var(--color-ink-faint)]">
            The escrow funds when the seller accepts, not now.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting && (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {submitting ? 'Opening deal…' : 'Open deal'}
      </button>
      {error && <p className="text-sm text-[var(--color-critical)]">Couldn&apos;t open deal: {error}</p>}
    </form>
  );
}

function FeeLine({
  label,
  value,
  strong,
  faint,
}: {
  label: string;
  value: number;
  strong?: boolean;
  faint?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={`text-[12px] ${faint ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-ink-dim)]'}`}
      >
        {label}
      </span>
      <span
        className={`mono tabular-nums ${
          strong ? 'text-[14px] font-semibold text-[var(--color-ink)]' : 'text-[12px] text-[var(--color-ink)]'
        }`}
      >
        {formatUsdc(value)}
      </span>
    </div>
  );
}
