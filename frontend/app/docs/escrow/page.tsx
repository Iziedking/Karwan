'use client';

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
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        {t.title}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <p
        className="mt-6 inline-block border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-3 py-2 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]"
        style={{ borderRadius: 3 }}
      >
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
