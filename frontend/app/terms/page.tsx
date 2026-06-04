'use client';

import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';
import { TermsContent } from '@/shared/components/TermsContent';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function TermsPage() {
  const t = useTranslations().termsPage;
  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <SectionTag tone="dark">{t.eyebrow}</SectionTag>
        <HeroHeadline size="md">
          {t.headlineLead} <Accent>{t.headlineAccent}</Accent><Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-6 text-[15px] text-[var(--lp-text-muted)] leading-relaxed max-w-[58ch]">
          {t.intro}
        </p>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-[72ch]">
          <TermsContent />
        </div>
      </Band>
    </FullBleed>
  );
}
