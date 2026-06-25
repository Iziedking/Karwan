'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/core/api';

export interface FinancierEligibility {
  eligible: boolean;
  tenureDays: number;
  tenureOk: boolean;
  stakeUsdc: number;
  stakeOk: boolean;
  repScore: number;
  repTier: string;
  repOk: boolean;
  reasons: string[];
  status: 'none' | 'applied' | 'approved' | 'rejected';
}

/// The financier application card. Anyone can fund trade on Karwan, but the
/// desk stays locked until you clear a real bar: time on Karwan, a stake (skin
/// in the game), and a reputation at least COLD. Each check shows live, with a
/// link to fix what is missing. On an eligible apply the desk unlocks at once.
export function FinancierApply({
  eligibility,
  onApplied,
}: {
  eligibility: FinancierEligibility;
  onApplied: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checks = [
    {
      label: 'Time on Karwan',
      ok: eligibility.tenureOk,
      value: `${eligibility.tenureDays}d`,
      need: 'Your account needs a little more history.',
      fix: null as { href: string; label: string } | null,
    },
    {
      label: 'Stake',
      ok: eligibility.stakeOk,
      value: `$${eligibility.stakeUsdc.toFixed(2)}`,
      need: 'Stake some USDC in the vault first.',
      fix: { href: '/stake', label: 'Stake USDC' },
    },
    {
      label: 'Reputation',
      ok: eligibility.repOk,
      value: eligibility.repTier,
      need: 'Reach at least the COLD tier through settled deals.',
      fix: { href: '/p2p', label: 'Trade to build it' },
    },
  ];

  async function apply() {
    if (busy || !eligibility.eligible) return;
    setBusy(true);
    setError(null);
    try {
      await api.financierApply();
      onApplied();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not apply. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const pendingReview = eligibility.status === 'applied';

  return (
    <div className="max-w-[640px] mx-auto py-12">
      <p className="mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:FINANCIER:]
      </p>
      <h1 className="mt-2 font-sans text-[30px] sm:text-[36px] font-extrabold tracking-[-0.02em] text-[var(--lp-dark)] leading-[1.05]">
        Fund trade, earn the spread<span className="text-[var(--lp-accent)]">.</span>
      </h1>
      <p className="mt-4 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[52ch]">
        Financiers advance against accepted invoices and fund purchase orders, then collect
        repayment when the trade settles on chain. Anyone can apply. The desk unlocks once you
        meet the bar below.
      </p>

      <div
        className="mt-8 divide-y"
        style={{ borderColor: 'var(--lp-border-light)' }}
      >
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-3 py-4">
            <span
              aria-hidden
              className="shrink-0 inline-flex items-center justify-center w-5 h-5 mono text-[11px] font-bold"
              style={{
                color: c.ok ? '#4f8a3f' : 'var(--lp-text-muted)',
                background: c.ok ? 'rgba(79,138,63,0.16)' : 'rgba(0,0,0,0.05)',
                borderRadius: 5,
              }}
            >
              {c.ok ? '✓' : '·'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[var(--lp-dark)]">{c.label}</p>
              {!c.ok && <p className="mt-0.5 text-[12px] leading-snug text-[var(--lp-text-sub)]">{c.need}</p>}
            </div>
            <span className="shrink-0 mono text-[13px] tabular-nums text-[var(--lp-dark)]">{c.value}</span>
            {!c.ok && c.fix && (
              <Link
                href={c.fix.href}
                className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] underline underline-offset-2 hover:text-[var(--lp-dark)]"
              >
                {c.fix.label}
              </Link>
            )}
          </div>
        ))}
      </div>

      {pendingReview ? (
        <p className="mt-8 text-[13px] text-[var(--lp-text-sub)]">
          Application received. We are reviewing it and will open your desk shortly.
        </p>
      ) : (
        <div className="mt-8 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={apply}
            disabled={busy || !eligibility.eligible}
            className="mono text-[11px] uppercase tracking-[0.1em] font-bold px-5 py-3 bg-[var(--lp-dark)] text-[var(--lp-bg)] disabled:opacity-40 transition"
            style={{
              borderTopLeftRadius: 11,
              borderTopRightRadius: 11,
              borderBottomLeftRadius: 11,
              borderBottomRightRadius: 3,
            }}
          >
            {busy ? 'Applying...' : eligibility.eligible ? 'Apply to fund trade' : 'Not eligible yet'}
          </button>
          {!eligibility.eligible && (
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              clear the checks above to apply
            </span>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-[12px] leading-snug text-[var(--lp-critical)]">{error}</p>}
    </div>
  );
}
