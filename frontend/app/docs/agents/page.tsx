'use client';

import {
  DocsEyebrow,
  DocsH2,
  DocsH3,
  DocsP,
  DocsList,
  DocsListItem,
  DocsFigure,
  DocsCallout,
} from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function DocsAgentsPage() {
  const t = useTranslations().docsAgentsPage;
  return (
    <article>
      <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        {t.title}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>{t.intro}</DocsP>

      <DocsH2>{t.howNegotiationRuns.heading}</DocsH2>
      <DocsP>{t.howNegotiationRuns.auction}</DocsP>
      <DocsP>{t.howNegotiationRuns.concession}</DocsP>
      <DocsP>{t.howNegotiationRuns.privacy}</DocsP>

      <DocsFigure
        src="/docs/images/negotiation-timeline.png"
        alt={t.timelineFigure.alt}
        caption={t.timelineFigure.caption}
      />

      <DocsH3>{t.whyHuman.heading}</DocsH3>
      <DocsList>
        <DocsListItem>
          <strong>{t.whyHuman.anchors.label}</strong> {t.whyHuman.anchors.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.whyHuman.reputation.label}</strong>{' '}
          {t.whyHuman.reputation.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.whyHuman.closes.label}</strong> {t.whyHuman.closes.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.whyHuman.alternatives.label}</strong>{' '}
          {t.whyHuman.alternatives.body}
        </DocsListItem>
      </DocsList>

      <DocsCallout title={t.approval.title}>{t.approval.body}</DocsCallout>

      <DocsH2>{t.guardrails.heading}</DocsH2>
      <DocsP>{t.guardrails.body}</DocsP>

      <DocsFigure
        src="/docs/images/agent-guardrails.png"
        alt={t.guardrailsFigure.alt}
        caption={t.guardrailsFigure.caption}
      />
    </article>
  );
}
