'use client';

import { DocsAskAi } from '@/features/docs/components/DocsAskAi';
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
      <h1 className="mt-3 text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-[var(--ink)]">
        {t.headline}
      </h1>
      <DocsAskAi />
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
