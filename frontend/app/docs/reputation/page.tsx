'use client';

import Link from 'next/link';
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

export default function DocsReputationPage() {
  const t = useTranslations().docsReputationPage;
  return (
    <article>
      <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        {t.title}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>{t.intro}</DocsP>

      <DocsH2>{t.signals.heading}</DocsH2>
      <DocsP>{t.signals.lead}</DocsP>
      <DocsList>
        <DocsListItem>
          <strong>{t.signals.items.stake.label}</strong> {t.signals.items.stake.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.signals.items.deals.label}</strong> {t.signals.items.deals.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.signals.items.volume.label}</strong> {t.signals.items.volume.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.signals.items.tenure.label}</strong> {t.signals.items.tenure.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.signals.items.activity.label}</strong> {t.signals.items.activity.body}
        </DocsListItem>
      </DocsList>
      <DocsP>{t.signals.penalty}</DocsP>
      <DocsP>
        {t.signals.referralPrefix}{' '}
        <Link
          href="/docs/roadmap#referral-marketing-rail"
          className="underline decoration-[var(--lp-accent)] underline-offset-2 hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          {t.signals.referralLink}
        </Link>
        {t.signals.referralSuffix}
      </DocsP>

      <DocsH2>{t.tiers.heading}</DocsH2>
      <DocsP>{t.tiers.lead}</DocsP>
      <DocsList>
        <DocsListItem><strong>NEW (0 to 199).</strong> {t.tiers.items.new}</DocsListItem>
        <DocsListItem><strong>COLD (200 to 399).</strong> {t.tiers.items.cold}</DocsListItem>
        <DocsListItem><strong>ESTABLISHED (400 to 599).</strong> {t.tiers.items.established}</DocsListItem>
        <DocsListItem><strong>STRONG (600 to 799).</strong> {t.tiers.items.strong}</DocsListItem>
        <DocsListItem><strong>ELITE (800 to 1000).</strong> {t.tiers.items.elite}</DocsListItem>
      </DocsList>
      <DocsP>{t.tiers.breakpoints}</DocsP>

      <DocsFigure
        src="/docs/images/reputation-tiers.png"
        alt={t.tiers.figureAlt}
        caption={t.tiers.figureCaption}
      />

      <DocsH2>{t.resistance.heading}</DocsH2>
      <DocsP>{t.resistance.lead}</DocsP>
      <DocsH3>{t.resistance.volumeFarming.heading}</DocsH3>
      <DocsP>{t.resistance.volumeFarming.body}</DocsP>
      <DocsH3>{t.resistance.stakeAndRun.heading}</DocsH3>
      <DocsP>{t.resistance.stakeAndRun.body}</DocsP>
      <DocsH3>{t.resistance.selfDealing.heading}</DocsH3>
      <DocsP>{t.resistance.selfDealing.body}</DocsP>
      <DocsH3>{t.resistance.matchAndCancel.heading}</DocsH3>
      <DocsP>{t.resistance.matchAndCancel.body}</DocsP>
      <DocsH3>{t.resistance.decay.heading}</DocsH3>
      <DocsP>{t.resistance.decay.body}</DocsP>

      <DocsH2>{t.staking.heading}</DocsH2>
      <DocsP>{t.staking.body}</DocsP>
      <DocsP>{t.staking.cooldown}</DocsP>

      <DocsCallout title={t.staking.calloutTitle}>
        {t.staking.calloutBody}
      </DocsCallout>

      <DocsFigure
        src="/docs/images/stake-card.png"
        alt={t.staking.figureAlt}
        caption={t.staking.figureCaption}
      />
    </article>
  );
}
