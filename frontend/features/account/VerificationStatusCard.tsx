'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type VerificationEligibilityResponse } from '@/core/api';
import { PageCard, SectionTag } from '@/shared/components/Bands';
import { Hint } from '@/shared/components/Hint';
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
      <section className="p-5 sm:p-6" data-float-guard aria-labelledby="account-verification-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <SectionTag tone="dark">{t.eyebrow}</SectionTag>
            <Hint glow side="bottom" align="start">
              {t.body[status]}
            </Hint>
          </div>
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
        <div className="mt-5 grid gap-x-6">
          {capabilities.map(([label, enabled], index) => (
            <div
              key={label}
              className="flex min-h-11 min-w-0 items-center justify-between gap-4 border-t border-white/10 py-2.5"
            >
              <span className="min-w-0 flex-1 text-[12px] text-white/70">
                <span className="me-2 mono text-[9px] text-white/35">
                  [:{String(index + 1).padStart(2, '0')}]
                </span>
                {label}
              </span>
              <span
                className="shrink-0 whitespace-nowrap text-end mono text-[9px] font-bold uppercase tracking-[0.08em]"
                style={{ color: enabled ? 'var(--lp-positive, #6be39a)' : 'var(--lp-warning, #ffc857)' }}
              >
                {enabled ? t.capabilities.available : t.capabilities.verificationRequired}
              </span>
            </div>
          ))}
          {/* The passport is what this list adds up to: the page a counterparty
              or a financier actually reads. An individual account has three
              capabilities, so the fourth cell of the grid was simply empty. */}
          <a
            href={`/credit-passport/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-11 min-w-0 items-center justify-between gap-4 border-t border-white/10 py-2.5 transition-colors hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          >
            <span className="min-w-0 flex-1 text-[12px] text-white/70 group-hover:text-white">
              <span className="me-2 mono text-[9px] text-white/35">
                [:{String(capabilities.length + 1).padStart(2, '0')}]
              </span>
              {t.publicPassport}
            </span>
            <span
              aria-hidden
              className="mono text-[11px] text-[var(--lp-accent)] transition-transform group-hover:translate-x-0.5"
            >
              ↗
            </span>
          </a>
        </div>

        {canReviewBusiness && (
          <Link
            href="/business/verification"
            className="mt-4 inline-flex min-h-11 items-center mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--lp-accent)] hover:text-[var(--lp-accent-hover)]"
          >
            {t.reviewBusiness}
          </Link>
        )}
      </section>
    </PageCard>
  );
}
