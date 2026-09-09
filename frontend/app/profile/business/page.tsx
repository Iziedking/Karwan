'use client';

import Link from 'next/link';
import { isBusinessAccount } from '@/features/account/accountKind';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function BusinessProfilePage() {
  const t = useTranslations().businessProfilePage;
  const common = useTranslations().common;
  const { profile, fetchState, isConnected, refresh } = useUserProfile();
  const business = isBusinessAccount(profile);
  const pending = isConnected && (fetchState === 'loading' || fetchState === 'idle');
  const benefits = [
    [t.findTitle, t.findBody, 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
    [t.dealTitle, t.dealBody, 'M9 15l6-6 M10 13a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-2 2 M14 11a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l2-2'],
    [t.payTitle, t.payBody, 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6'],
    [t.recordTitle, t.recordBody, 'M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h3'],
  ];

  return (
    <section className="product-surface mx-auto max-w-[880px] px-4 py-6 sm:px-8 sm:py-10">
      <header className="max-w-[660px]">
        <span aria-hidden className="mb-5 inline-flex size-20 items-center justify-center rounded-[24px] border border-[var(--lp-border-light)] bg-[var(--lp-workspace-soft)] text-[var(--lp-accent)]">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3 M3 12a24 24 0 0 0 18 0 M12 11v4" /></svg>
        </span>
        <h1 className="text-[clamp(2.2rem,4.5vw,3.6rem)] font-semibold leading-[1.03] tracking-[-0.05em] text-[var(--lp-dark)]">{t.title}</h1>
        <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-[var(--lp-text-sub)]">{t.intro}</p>
      </header>

      {business && profile ? (
        <div className="mt-7 rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-6">
          <p className="text-sm text-[var(--lp-text-sub)]">{t.label}</p>
          <h2 className="mt-1 break-words text-2xl font-semibold text-[var(--lp-dark)]">{profile.smeProfile?.companyName || profile.displayName}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--lp-text-sub)]">{t.manageBody}</p>
          <Link href="/business/verification" className="mt-5 inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-full bg-[var(--lp-accent)] px-5 py-3 text-sm font-bold text-[#10170b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">{t.manage}<span aria-hidden>→</span></Link>
          <Link href="/profile/edit" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--lp-text-sub)] underline underline-offset-4">{t.edit}</Link>
        </div>
      ) : null}

      <ul className="mt-8 divide-y divide-[var(--lp-border-light)]">
        {benefits.map(([title, body, path]) => (
          <li key={title} className="flex gap-4 py-5 first:pt-0 sm:gap-5">
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full border border-[var(--lp-border-light)] text-[var(--lp-text-sub)]">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
            </span>
            <div><h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{title}</h2><p className="mt-1 max-w-[56ch] text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{body}</p></div>
          </li>
        ))}
      </ul>

      {pending ? <p role="status" className="mt-5 text-[var(--lp-text-sub)]">{common.loading}</p> : fetchState === 'error' ? (
        <div role="alert" className="mt-5 text-[var(--lp-text-sub)]"><p>{t.loadError}</p><button onClick={refresh} className="mt-2 min-h-11 underline">{t.retry}</button></div>
      ) : !business ? (
        <div className="mt-5 border-t border-[var(--lp-border-light)] pt-6">
          <Link href="/profile/business/setup" className="flex min-h-[52px] items-center justify-between gap-3 rounded-full bg-[var(--lp-accent)] px-6 py-3 text-[15px] font-bold text-[#10170b] transition-colors hover:bg-[var(--lp-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">{t.setup}<span aria-hidden>→</span></Link>
          <p className="mt-4 text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{t.notice}</p>
        </div>
      ) : null}
    </section>
  );
}
