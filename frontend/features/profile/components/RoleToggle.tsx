'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type UserProfile, type UserRole, ApiError } from '@/core/api';
import { isBusinessAccount } from '@/features/account/accountKind';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

type Option = { value: UserRole; label: string; description: string };

/// Role picker as one segmented control rather than three cards.
///
/// The lozenge slides between the three positions, and its resting place IS the
/// saved role, so the control states the current answer instead of making the
/// user hunt for a highlighted card. Ineligible roles stay pickable on purpose:
/// choosing one routes to onboarding to collect the missing details, which is a
/// path forward rather than a dead end.
export function RoleToggle({
  profile,
  onUpdate,
}: {
  profile: UserProfile;
  onUpdate: (next: UserProfile) => void;
}) {
  const t = useTranslations().roleToggle;
  // A business reads as a company sourcing/supplying goods and services, not an
  // individual buyer/seller, so it gets the business-framed labels.
  const opts = isBusinessAccount(profile) ? t.businessOptions : t.options;
  const OPTIONS: Option[] = [
    { value: 'buyer', ...opts.buyer },
    { value: 'seller', ...opts.seller },
    { value: 'both', ...opts.both },
  ];
  const [submitting, setSubmitting] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const activeIndex = Math.max(
    0,
    OPTIONS.findIndex((o) => o.value === profile.role),
  );
  const active = OPTIONS[activeIndex];

  function eligibilityFor(role: UserRole): { ok: boolean; reason?: string } {
    const wantsBuyer = role === 'buyer' || role === 'both';
    const wantsSeller = role === 'seller' || role === 'both';
    if (wantsBuyer && !profile.buyer) return { ok: false, reason: t.needBuyerDetails };
    if (wantsSeller && !profile.seller) return { ok: false, reason: t.needSellerDetails };
    return { ok: true };
  }

  async function switchTo(role: UserRole) {
    if (role === profile.role) return;
    const eligibility = eligibilityFor(role);
    if (!eligibility.ok) {
      router.push(`/onboarding?role=${role}`);
      return;
    }
    setSubmitting(role);
    setError(null);
    try {
      const next = await api.saveProfile({
        address: profile.address,
        role,
        displayName: profile.displayName,
        ...(profile.seller && { seller: profile.seller }),
        ...(profile.buyer && { buyer: profile.buyer }),
      });
      onUpdate(next.profile);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t.switchFailed;
      setError(msg);
    } finally {
      setSubmitting(null);
    }
  }

  const activeEligibility = eligibilityFor(active.value);

  return (
    <div>
      {error && (
        <div
          className="mb-3 px-3 py-2.5 text-[12.5px]"
          style={{
            background: 'rgba(176,61,58,0.10)',
            color: '#b03d3a',
            border: '1px solid rgba(176,61,58,0.35)',
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            borderBottomLeftRadius: 8,
            borderBottomRightRadius: 2,
          }}
        >
          {error}
        </div>
      )}

      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        [:{t.eyebrow}:]
      </span>

      <div
        role="radiogroup"
        aria-label={t.ariaGroup}
        className="relative mt-2.5 inline-flex p-1 w-full max-w-[440px]"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderRadius: 999,
        }}
      >
        {/* The lozenge. Absolutely positioned and translated by thirds, so the
            selection glides to the next position instead of cutting to it. */}
        <span
          aria-hidden
          className="absolute top-1 bottom-1 transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            width: 'calc(33.333% - 2.667px)',
            left: 4,
            borderRadius: 999,
            background: 'var(--lp-accent)',
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />

        {OPTIONS.map((opt) => {
          const isActive = profile.role === opt.value;
          const eligibility = eligibilityFor(opt.value);
          const busy = submitting === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => switchTo(opt.value)}
              disabled={busy || isActive}
              title={!eligibility.ok ? eligibility.reason : undefined}
              className="relative z-10 flex-1 px-4 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] rounded-full transition-colors"
              style={{
                background: 'transparent',
                color: isActive ? 'var(--lp-dark)' : 'var(--lp-text-sub)',
                opacity: !isActive && !eligibility.ok ? 0.55 : 1,
                cursor: !eligibility.ok ? 'help' : undefined,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* One line, describing whatever is selected. The three cards each carried
          their own copy; a single control needs a single caption. */}
      <p
        aria-live="polite"
        className="mt-3 text-[13px] leading-snug text-[var(--lp-text-sub)]"
      >
        {submitting
          ? t.saving
          : !activeEligibility.ok
            ? activeEligibility.reason
            : active.description}
      </p>
    </div>
  );
}
