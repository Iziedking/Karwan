'use client';

import { FullBleed, Band } from '@/shared/components/Bands';
import { TermsContent, TERMS_DISPLAY_VERSION, TERMS_LAST_UPDATED } from '@/shared/components/TermsContent';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function TermsPage() {
  const t = useTranslations().termsPage;
  return (
    <FullBleed>
      <Band tone="light" compact>
        <div className="mx-auto max-w-[76ch] py-6 sm:py-10">
          <header className="mb-10 border-b border-[var(--lp-border-light)] pb-8">
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--lp-dark)]">{t.eyebrow}</h1>
            <p className="mt-5 max-w-[62ch] text-[16px] leading-[1.8] text-[var(--lp-text-sub)]">{t.intro}</p>
            <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--lp-text-sub)]">
              <span>{t.footer.version} {TERMS_DISPLAY_VERSION}</span>
              <span>{t.footer.updated} <time dir="ltr" dateTime={TERMS_LAST_UPDATED}>{TERMS_LAST_UPDATED}</time></span>
            </p>
          </header>
          <TermsContent contents />
        </div>
      </Band>
    </FullBleed>
  );
}
