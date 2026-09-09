'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type UserProfile } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { isBusinessAccount } from '@/features/account/accountKind';
import { businessSetupInput } from '@/features/profile/businessSetup';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useUserProfile, PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function BusinessSetupPage() {
  const t = useTranslations().businessProfilePage;
  return <AuthGuard gateTitle={t.setupTitle} gateBody={t.setupBody}><BusinessSetup /></AuthGuard>;
}

function BusinessSetup() {
  const t = useTranslations().businessProfilePage;
  const common = useTranslations().common;
  const { profile, fetchState, refresh } = useUserProfile();
  return (
    <section className="product-surface mx-auto max-w-[680px] px-4 py-7 sm:px-8 sm:py-10">
      <h1 className="text-[clamp(2rem,4vw,2.8rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--lp-dark)]">{t.setupTitle}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{t.setupBody}</p>
      {fetchState === 'loading' || fetchState === 'idle' ? <p role="status" className="mt-8">{common.loading}</p> : fetchState === 'error' ? (
        <div role="alert" className="mt-8"><p>{t.loadError}</p><button onClick={refresh} className="min-h-11 underline">{t.retry}</button></div>
      ) : profile ? <BusinessSetupForm key={profile.address} profile={profile} /> : (
        <div className="mt-8"><p>{t.noProfile}</p><Link href="/onboarding" className="mt-3 inline-flex min-h-11 items-center underline">{t.create}</Link></div>
      )}
    </section>
  );
}

function BusinessSetupForm({ profile }: { profile: UserProfile }) {
  const t = useTranslations().businessProfilePage;
  const common = useTranslations().common;
  const router = useRouter();
  const qc = useQueryClient();
  const business = isBusinessAccount(profile);
  const [name, setName] = useState(business ? profile.displayName : '');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !name.trim() || (!business && !confirmed)) return;
    setSaving(true);
    setError(null);
    try {
      // Refresh before building the payload: another tab may have edited limits.
      // A failed read must never fall back to an incomplete profile write.
      const current = await api.getProfile(profile.address);
      if (!current.profile) throw new Error('profile_missing');
      const result = await api.saveProfile(businessSetupInput(current.profile, name, confirmed));
      qc.setQueryData(qk.profile.me(profile.address), result.profile);
      window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
      router.push('/business/verification');
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'name_taken' ? t.nameTaken : t.error);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-7 space-y-6 rounded-[22px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-7" aria-busy={saving}>
      <div>
        <label htmlFor="business-name" className="block text-[15px] font-semibold text-[var(--lp-dark)]">{t.name}</label>
        <input id="business-name" name="organization" autoComplete="organization" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} disabled={saving} aria-describedby="business-name-hint" className="mt-3 min-h-[52px] w-full rounded-xl border border-[var(--lp-outline)] bg-[var(--lp-light)] px-4 text-base text-[var(--lp-dark)] outline-none focus:border-[var(--lp-accent)] focus:ring-2 focus:ring-[var(--lp-accent)]" />
        <p id="business-name-hint" className="mt-2 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{t.nameHint}</p>
      </div>
      {!business && (
        <div className="border-t border-[var(--lp-border-light)] pt-5">
          <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{t.notice}</p>
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 py-2 text-[14px] font-medium text-[var(--lp-dark)]">
            <input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={saving} className="size-5 shrink-0 accent-[var(--lp-accent)]" />{t.confirm}
          </label>
        </div>
      )}
      {error && <p role="alert" className="text-sm leading-relaxed text-[var(--lp-text-sub)]">{error}</p>}
      <div>
        <button type="submit" disabled={saving || !name.trim() || (!business && !confirmed)} className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-full bg-[var(--lp-accent)] px-5 py-3 text-[15px] font-bold text-[#10170b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] disabled:cursor-not-allowed disabled:opacity-50">{saving ? common.loading : t.save}<span aria-hidden>→</span></button>
        <p className="mt-3 text-center text-[12px] text-[var(--lp-text-sub)]">{t.next}</p>
        <Link href="/profile/business" className="mt-2 flex min-h-11 items-center justify-center text-[14px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4">{common.cancel}</Link>
      </div>
    </form>
  );
}
