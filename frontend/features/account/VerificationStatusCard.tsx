'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type VerificationEligibilityResponse } from '@/core/api';
import { PageCard, SectionTag } from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

type VerificationStatus = VerificationEligibilityResponse['verification']['status'];

const STATUS_TONE: Record<VerificationStatus, string> = {
  unverified: 'var(--lp-text-muted)',
  pending: 'var(--lp-warning, #ffc857)',
  verified: 'var(--lp-positive, #6be39a)',
  rejected: 'var(--lp-critical, #ff6a6a)',
  expired: 'var(--lp-warning, #ffc857)',
  revoked: 'var(--lp-critical, #ff6a6a)',
};

export function VerificationStatusCard({ address }: { address: string }) {
  const t = useTranslations().account.verification;
  const [data, setData] = useState<VerificationEligibilityResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getVerificationEligibility(address)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      // Older backend deployments do not expose this read yet. Hiding the card
      // is safer than inventing an account state or flashing a false warning.
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!data) return null;

  const status = data.verification.status;
  const tone = STATUS_TONE[status];
  const capabilities = [
    [t.capabilities.directDeals, data.eligibility.directDeals],
    [t.capabilities.matching, data.eligibility.agentMatching],
    [t.capabilities.reputation, data.eligibility.reputationEligible],
    ...(data.accountKind === 'business'
      ? ([[t.capabilities.business, data.eligibility.businessPerks]] as const)
      : []),
  ] as const;

  const canReviewBusiness =
    data.accountKind === 'business' && status !== 'verified' && status !== 'pending';

  return (
    <PageCard tone="dark" className="mt-5 max-w-[640px]">
      <section className="p-5 sm:p-6" aria-labelledby="account-verification-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTag tone="dark">{t.eyebrow}</SectionTag>
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: tone, borderColor: `color-mix(in srgb, ${tone} 42%, transparent)` }}
            aria-live="polite"
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {t.status[status]}
          </span>
        </div>

        <h2
          id="account-verification-title"
          className="mt-4 font-sans text-[22px] font-extrabold tracking-[-0.025em] text-white"
        >
          {t.title}
        </h2>
        <p className="mt-2 max-w-[54ch] text-[13px] leading-relaxed text-white/65">
          {t.body[status]}
        </p>

        <div className="mt-5 grid gap-x-6 sm:grid-cols-2">
          {capabilities.map(([label, enabled], index) => (
            <div
              key={label}
              className="flex min-h-11 items-center justify-between gap-4 border-t border-white/10 py-2.5"
            >
              <span className="text-[12px] text-white/70">
                <span className="me-2 mono text-[9px] text-white/35">
                  [:{String(index + 1).padStart(2, '0')}]
                </span>
                {label}
              </span>
              <span
                className="max-w-[16ch] text-end mono text-[9px] font-bold uppercase tracking-[0.08em]"
                style={{ color: enabled ? 'var(--lp-positive, #6be39a)' : 'var(--lp-warning, #ffc857)' }}
              >
                {enabled ? t.capabilities.available : t.capabilities.verificationRequired}
              </span>
            </div>
          ))}
        </div>

        {canReviewBusiness && (
          <Link
            href="#company"
            className="mt-4 inline-flex min-h-11 items-center mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-accent)] hover:text-[var(--lp-accent-hover)]"
          >
            {t.reviewBusiness}
          </Link>
        )}
      </section>
    </PageCard>
  );
}
