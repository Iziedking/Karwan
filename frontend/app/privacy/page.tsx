'use client';

import { FullBleed, Band } from '@/shared/components/Bands';
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/features/privacy/privacyNotice';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';

/// The privacy notice (view 39), laid out like the terms beside it.
export default function PrivacyPage() {
  const messages = useTranslations();
  const { locale } = useLocale();
  const p = messages.startFlow.privacy;
  return (
    <FullBleed>
      <Band tone="light" compact>
        <article lang="en" dir="ltr" className="mx-auto max-w-[76ch] py-6 sm:py-10">
          <header className="mb-10 border-b border-[var(--lp-border-light)] pb-8">
            <h1 lang={locale} className="text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--lp-dark)]">{p.link}</h1>
            {locale !== 'en' ? (
              <p lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className="mt-4 text-[15px] font-semibold text-[var(--lp-dark)]">{p.englishOnly}</p>
            ) : null}
            <p className="mt-5 max-w-[62ch] text-[16px] leading-[1.8] text-[var(--lp-text-sub)]">{PRIVACY_INTRO}</p>
            <p lang={locale} className="mt-5 text-[14px] font-medium text-[var(--lp-text-sub)]">
              {messages.termsPage.footer.updated} <time dateTime={PRIVACY_UPDATED}>{PRIVACY_UPDATED}</time>
            </p>
          </header>

          <nav aria-label={p.link} className="mb-10">
            <ol className="grid gap-1.5 text-[15px] font-medium sm:grid-cols-2">
              {PRIVACY_SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="inline-flex min-h-11 items-center text-[var(--lp-dark)] underline-offset-4 hover:underline">{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-10">
            {PRIVACY_SECTIONS.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24">
                <h2 id={`${s.id}-title`} className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{s.title}</h2>
                {s.body?.map((line) => (
                  <p key={line} className="mt-3 text-[16px] leading-[1.8] text-[var(--lp-text-sub)]">{line}</p>
                ))}
                {s.list ? (
                  <dl className="mt-4 divide-y divide-[var(--lp-border-light)] border-y border-[var(--lp-border-light)]">
                    {s.list.map((item) => (
                      <div key={item.label} className="grid gap-1 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
                        <dt className="text-[15px] font-semibold text-[var(--lp-dark)]">{item.label}</dt>
                        <dd className="text-[15px] leading-[1.7] text-[var(--lp-text-sub)]">{item.text}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      </Band>
    </FullBleed>
  );
}
