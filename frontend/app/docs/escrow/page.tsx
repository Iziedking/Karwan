'use client';

import { DocsAskAi } from '@/features/docs/components/DocsAskAi';
import {
  DocsEyebrow,
  DocsH2,
  DocsP,
  DocsList,
  DocsListItem,
  DocsCallout,
} from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Escrow architecture for users: who holds the money, how terms drive the
/// contract, how disputes resolve, and what admins can and cannot do. It
/// describes the mainnet design in review, and says so above the fold, so the
/// page never reads as a claim about what is live today.
export default function DocsEscrowPage() {
  const t = useTranslations().docsEscrowPage;
  return (
    <article>
      <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
      <h1 className="mt-3 text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-[var(--ink)]">
        {t.title}
      </h1>
      <DocsAskAi />
      <p className="mt-5 max-w-[64ch] text-[14px] font-medium leading-relaxed text-[var(--ink-muted)]">
        {t.status}
      </p>
      <DocsP>{t.intro}</DocsP>

      {t.sections.map((section) => (
        <section key={section.heading}>
          <DocsH2>{section.heading}</DocsH2>
          {section.intro ? <DocsP>{section.intro}</DocsP> : null}
          <DocsList>
            {section.items.map((item) => (
              <DocsListItem key={item.label}>
                <strong>{item.label}</strong> {item.body}
              </DocsListItem>
            ))}
          </DocsList>
        </section>
      ))}

      <DocsCallout title={t.callout.title}>{t.callout.body}</DocsCallout>
    </article>
  );
}
