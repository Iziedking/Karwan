'use client';

import {
  DocsEyebrow,
  DocsH2,
  DocsH3,
  DocsP,
  DocsList,
  DocsListItem,
  DocsCallout,
} from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function DocsRoadmapPage() {
  const t = useTranslations().docsRoadmapPage;
  return (
    <article>
      <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        {t.heading}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>{t.intro}</DocsP>

      <DocsH2>{t.live.title}</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>{t.live.items.match.title}</strong> {t.live.items.match.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.live.items.stake.title}</strong> {t.live.items.stake.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.live.items.passport.title}</strong>{' '}
          {t.live.items.passport.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.live.items.shareable.title}</strong>{' '}
          {t.live.items.shareable.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.live.items.cashout.title}</strong>{' '}
          {t.live.items.cashout.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.live.items.vault.title}</strong> {t.live.items.vault.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.live.items.terms.title}</strong> {t.live.items.terms.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.live.items.signin.title}</strong>{' '}
          {t.live.items.signin.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.live.items.languages.title}</strong>{' '}
          {t.live.items.languages.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.live.items.tours.title}</strong> {t.live.items.tours.body}
        </DocsListItem>
      </DocsList>

      <DocsH2>{t.next.title}</DocsH2>

      <DocsH3>{t.next.x402.title}</DocsH3>
      <DocsP>{t.next.x402.body}</DocsP>

      <DocsH3>{t.next.factoring.title}</DocsH3>
      <DocsP>{t.next.factoring.body}</DocsP>

      <DocsH3>{t.next.symmetric.title}</DocsH3>
      <DocsP>{t.next.symmetric.body}</DocsP>

      <DocsH3>{t.next.verified.title}</DocsH3>
      <DocsP>{t.next.verified.body}</DocsP>

      <DocsH3>{t.next.fileDelivery.title}</DocsH3>
      <DocsP>{t.next.fileDelivery.body}</DocsP>

      <DocsH3 id="referral-marketing-rail">{t.next.referral.title}</DocsH3>
      <DocsP>{t.next.referral.body}</DocsP>

      <DocsH3>{t.next.mainnet.title}</DocsH3>
      <DocsList>
        <DocsListItem>
          <strong>{t.next.mainnet.items.audit.title}</strong>{' '}
          {t.next.mainnet.items.audit.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.next.mainnet.items.safe.title}</strong>{' '}
          {t.next.mainnet.items.safe.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.next.mainnet.items.coverage.title}</strong>{' '}
          {t.next.mainnet.items.coverage.body}
        </DocsListItem>
      </DocsList>

      <DocsH3>{t.next.reach.title}</DocsH3>
      <DocsP>{t.next.reach.body}</DocsP>
      <DocsList>
        <DocsListItem>
          <strong>{t.next.reach.items.coverage.title}</strong>{' '}
          {t.next.reach.items.coverage.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.next.reach.items.handbook.title}</strong>{' '}
          {t.next.reach.items.handbook.body}
        </DocsListItem>
      </DocsList>

      <DocsCallout title={t.callout.title}>{t.callout.body}</DocsCallout>
    </article>
  );
}
