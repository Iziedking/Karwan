'use client';

import {
  DocsEyebrow,
  DocsH2,
  DocsP,
  DocsList,
  DocsListItem,
  DocsFigure,
  DocsCallout,
} from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function DocsDealsPage() {
  const t = useTranslations().docsDealsPage;
  return (
    <article>
      <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        {t.title}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>{t.intro}</DocsP>

      <DocsH2>{t.lifecycle.heading}</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>{t.lifecycle.open.label}</strong> {t.lifecycle.open.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.lifecycle.acceptFund.label}</strong> {t.lifecycle.acceptFund.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.lifecycle.deliver.label}</strong> {t.lifecycle.deliver.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.lifecycle.release.label}</strong> {t.lifecycle.release.body}
        </DocsListItem>
      </DocsList>

      <DocsP>{t.lifecycle.summary}</DocsP>

      <DocsFigure
        src="/docs/images/deal-lifecycle1.png"
        alt={t.figures.funded.alt}
        caption={t.figures.funded.caption}
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle2.png"
        alt={t.figures.waiting.alt}
        caption={t.figures.waiting.caption}
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle3.png"
        alt={t.figures.delivered.alt}
        caption={t.figures.delivered.caption}
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle4.png"
        alt={t.figures.releaseFirst.alt}
        caption={t.figures.releaseFirst.caption}
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle5.png"
        alt={t.figures.afterFirst.alt}
        caption={t.figures.afterFirst.caption}
      />
      <DocsFigure
        src="/docs/images/deal-lifecycle6.png"
        alt={t.figures.settled.alt}
        caption={t.figures.settled.caption}
      />

      <DocsH2>{t.shareable.heading}</DocsH2>
      <DocsP>{t.shareable.body}</DocsP>

      <DocsH2>{t.fee.heading}</DocsH2>
      <DocsP>{t.fee.body}</DocsP>

      <DocsH2>{t.review.heading}</DocsH2>
      <DocsP>{t.review.body}</DocsP>

      <DocsH2>{t.stake.heading}</DocsH2>
      <DocsP>{t.stake.body1}</DocsP>
      <DocsP>{t.stake.body2}</DocsP>

      <DocsH2>{t.cashout.heading}</DocsH2>
      <DocsP>{t.cashout.body}</DocsP>

      <DocsH2>{t.wrong.heading}</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>{t.wrong.mutualCancel.label}</strong> {t.wrong.mutualCancel.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.wrong.dispute.label}</strong> {t.wrong.dispute.body}
        </DocsListItem>
      </DocsList>

      <DocsCallout title={t.callout.title}>{t.callout.body}</DocsCallout>
    </article>
  );
}
