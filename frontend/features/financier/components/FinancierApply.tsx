'use client';
import { Hint } from '@/shared/components/Hint';
import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/core/api';
import { buttonClasses } from '@/shared/components/Button';
import { CARD_CLASS } from '@/shared/components/Card';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { financeDeskCopy } from '@/shared/i18n/messages/financeDesk';
import { PageTour } from '@/shared/guide/PageTour';
import { FINANCIER_APPLY_TOUR_ID, FINANCIER_APPLY_STEPS } from '@/shared/guide/tours';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';

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
  const { locale } = useLocale();
  const copy = financeDeskCopy[locale].apply;
  const tiers = useTranslations().financierDashboard.open.tier;
  const money = useMoneyText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tier = tiers[eligibility.repTier.toLowerCase() as keyof typeof tiers] ?? eligibility.repTier;

  const checks = [
    {
      label: copy.tenure,
      ok: eligibility.tenureOk,
      value: copy.days.replace('{days}', String(eligibility.tenureDays)),
      need: copy.tenureNeed,
      fix: null as { href: string; label: string } | null,
    },
    {
      label: copy.stake,
      ok: eligibility.stakeOk,
      value: money.text(eligibility.stakeUsdc),
      need: copy.stakeNeed,
      fix: { href: '/guarantee', label: copy.stakeFix },
    },
    {
      label: copy.reputation,
      ok: eligibility.repOk,
      value: tier,
      need: copy.reputationNeed,
      fix: { href: '/market', label: copy.reputationFix },
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
      setError(e instanceof ApiError ? e.message : copy.error);
    } finally {
      setBusy(false);
    }
  }

  const pendingReview = eligibility.status === 'applied';

  return (
    <div className="mx-auto max-w-[640px] px-5 py-12">
      <PageTour id={FINANCIER_APPLY_TOUR_ID} steps={FINANCIER_APPLY_STEPS} />
      <h1 className="flex items-center gap-2 text-[26px] font-semibold leading-tight text-[var(--ink)]">
        {copy.title}
        <Hint side="bottom">{copy.intro}</Hint>
      </h1>

      <ul className={`${CARD_CLASS} mt-6 divide-y divide-[var(--line)] px-5`}>
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-3 py-4">
            <span
              role="img"
              aria-label={c.ok ? copy.met : copy.notMet}
              className={`grid size-5 shrink-0 place-items-center rounded-full border text-[14px] leading-none ${c.ok ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)]' : 'border-[var(--line-strong)]'}`}
            >
              {c.ok ? '✓' : ''}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-[var(--ink)]">{c.label}</p>
              {!c.ok ? <p className="mt-0.5 text-[14px] leading-snug text-[var(--ink-secondary)]">{c.need}</p> : null}
              {!c.ok && c.fix ? (
                <Link href={c.fix.href} className="mt-1 inline-block text-[14px] font-medium text-[var(--ink)] underline underline-offset-2">
                  {c.fix.label}
                </Link>
              ) : null}
            </div>
            <span className="shrink-0 text-[15px] tabular-nums text-[var(--ink)]">{c.value}</span>
          </li>
        ))}
      </ul>

      {pendingReview ? (
        <p className="mt-6 text-[15px] text-[var(--ink-secondary)]">{copy.pending}</p>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-[14px] text-[var(--ink-muted)]">{eligibility.eligible ? copy.allMet : copy.meetAll}</p>
          <button
            type="button"
            onClick={apply}
            disabled={busy || !eligibility.eligible}
            aria-busy={busy}
            className={buttonClasses({ size: 'lg', className: 'w-full', loading: busy })}
          >
            {busy ? copy.applying : eligibility.eligible ? copy.apply : copy.notEligible}
          </button>
        </div>
      )}

      {error ? <p role="alert" className="mt-3 text-[14px] leading-snug text-[var(--color-critical)]">{error}</p> : null}
    </div>
  );
}
