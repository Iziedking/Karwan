'use client';

import {
  DocsEyebrow,
  DocsH3,
  DocsP,
} from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function DocsFaqPage() {
  const t = useTranslations().docsFaqPage;
  return (
    <article>
      <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        {t.headline}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>{t.intro}</DocsP>

      {t.items.map((item, i) => (
        <div key={i}>
          <DocsH3>{item.q}</DocsH3>
          <DocsP>{item.a}</DocsP>
        </div>
      ))}
    </article>
  );
}
