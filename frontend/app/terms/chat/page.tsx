'use client';

import { FullBleed, Band } from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Terms for the Karwan agent in chat, linked from the first message.
export default function ChatTermsPage() {
  const t = useTranslations().chatTerms;
  return (
    <FullBleed>
      <Band tone="light" compact>
        <div className="mx-auto max-w-[76ch] py-6 sm:py-10">
          <header className="mb-10 border-b border-[var(--lp-border-light)] pb-8">
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--lp-dark)]">{t.title}</h1>
            <p className="mt-5 max-w-[62ch] text-[16px] leading-[1.8] text-[var(--lp-text-sub)]">{t.intro}</p>
            <p className="mt-5 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.version}</p>
          </header>
          {t.sections.map((s) => (
            <section key={s.heading} className="border-b border-[var(--lp-border-light)] py-6 last:border-b-0">
              <h2 className="text-[18px] font-semibold text-[var(--lp-dark)]">{s.heading}</h2>
              <p className="mt-2 text-[16px] leading-[1.8] text-[var(--lp-text-sub)]">{s.body}</p>
            </section>
          ))}
        </div>
      </Band>
    </FullBleed>
  );
}
