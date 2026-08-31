'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { AccountGate } from '@/shared/components/AccountGate';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  Band,
  FullBleed,
  GridOverlay,
  HeroHeadline,
  PageCard,
  Punc,
  SectionTag,
} from '@/shared/components/Bands';
import { SmeCompanyBand } from '@/features/profile/components/SmeCompanyBand';
import {
  RegisterBusinessBand,
  type BusinessRegistrationStatus,
} from '@/features/profile/components/RegisterBusinessBand';
import {
  getBusinessVerificationProgress,
  getBusinessVerificationStep,
  hasRequiredBusinessProfile,
  type BusinessProfileMinimum,
} from '@/features/profile/businessVerificationModel';

export default function BusinessVerificationPage() {
  const t = useTranslations().registerBusiness.page;
  return (
    <AuthGuard gateTag={t.eyebrow} gateBody={t.signInBody}>
      <AccountGate kind="business">
        <BusinessVerificationPageInner />
      </AccountGate>
    </AuthGuard>
  );
}

function BusinessVerificationPageInner() {
  const t = useTranslations().registerBusiness.page;
  const { address, profile, refresh } = useUserProfile();
  const [status, setStatus] = useState<BusinessRegistrationStatus>('none');
  const [savedProfile, setSavedProfile] = useState<BusinessProfileMinimum | null>(null);
  const profileMinimum = savedProfile ?? profile?.smeProfile ?? null;
  const profileReady = hasRequiredBusinessProfile(profileMinimum);
  const step = getBusinessVerificationStep(status, profileMinimum);
  const current = getBusinessVerificationProgress(step);

  const steps = useMemo(
    () => [t.steps.profile, t.steps.evidence, t.steps.review],
    [t.steps.evidence, t.steps.profile, t.steps.review],
  );
  const handleStatusChange = useCallback((next: BusinessRegistrationStatus) => {
    setStatus(next);
  }, []);

  if (!address) return null;

  return (
    <FullBleed>
      <Band tone="dark" compact overlay={<GridOverlay />}>
        <Link
          href="/profile#identity"
          className="inline-flex min-h-11 items-center gap-2 mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lp-workspace-muted)] transition-colors hover:text-[var(--lp-workspace-ink)]"
        >
          <span aria-hidden>←</span>
          {t.backToProfile}
        </Link>
        <div className="mt-7 max-w-[760px]">
          <SectionTag tone="dark">{t.eyebrow}</SectionTag>
          <HeroHeadline size="md">
            {t.title}<Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-[var(--lp-workspace-muted)]">{t.lede}</p>
        </div>
      </Band>

      <Band tone="light" compact>
        <VerificationProgress labels={steps} current={current} ariaLabel={t.progressLabel} />

        <div className="mt-7 overflow-hidden border border-[var(--lp-border-light)] bg-[var(--lp-card)] shadow-[0_18px_54px_-34px_rgba(0,0,0,0.32)]">
          <SmeCompanyBand
            address={address}
            fallbackName={profile?.displayName}
            startEditing={!profileReady}
            verificationMode
            onSaved={(next) => {
              setSavedProfile(next);
              refresh();
            }}
          />

          <div className="border-t border-[var(--lp-border-light)]">
            {profileReady || status === 'submitted' || status === 'verified' ? (
              <RegisterBusinessBand
                address={address}
                mode="workflow"
                startEditing={status === 'none' || status === 'rejected'}
                onStatusChange={handleStatusChange}
              />
            ) : (
              <div className="px-4 py-8 md:px-8 md:py-10">
                <SectionTag>{t.steps.evidence}</SectionTag>
                <PageCard className="mt-4">
                  <div className="p-5 md:p-6">
                    <h2 className="font-sans text-[22px] font-extrabold tracking-[-0.025em] text-[var(--lp-dark)]">
                      {t.evidenceLockedTitle}
                    </h2>
                    <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
                      {t.evidenceLockedBody}
                    </p>
                  </div>
                </PageCard>
              </div>
            )}
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}

function VerificationProgress({
  labels,
  current,
  ariaLabel,
}: {
  labels: string[];
  current: number;
  ariaLabel: string;
}) {
  return (
    <ol
      aria-label={ariaLabel}
      className="grid grid-cols-3 gap-2 border-y border-[var(--lp-border-light)] py-3"
    >
      {labels.map((label, index) => {
        const number = index + 1;
        const complete = number < current;
        const active = number === current;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className="flex min-h-11 min-w-0 items-center gap-2"
          >
            <span
              aria-hidden
              className={
                complete || active
                  ? 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lp-accent)] mono text-[10px] font-bold text-[var(--lp-band-dark)]'
                  : 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--lp-outline)] mono text-[10px] text-[var(--lp-text-muted)]'
              }
            >
              {complete ? '✓' : number}
            </span>
            <span
              className={
                active
                  ? 'min-w-0 text-[11px] font-bold leading-tight text-[var(--lp-dark)] sm:text-[12px]'
                  : 'min-w-0 text-[10px] leading-tight text-[var(--lp-text-muted)] sm:text-[12px]'
              }
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
