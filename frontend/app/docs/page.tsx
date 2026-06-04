'use client';

import Link from 'next/link';
import {
  DocsEyebrow,
  DocsH2,
  DocsP,
  DocsList,
  DocsListItem,
} from '@/features/docs/components/Prose';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export default function DocsOverviewPage() {
  const t = useTranslations().docsIndexPage;
  return (
    <article>
      <DocsEyebrow>{t.eyebrow}</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        {t.headline}
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>{t.intro}</DocsP>

      <DocsH2>{t.twoWays.title}</DocsH2>
      <DocsP>{t.twoWays.lede}</DocsP>
      <DocsList>
        <DocsListItem>
          <strong>{t.twoWays.direct.label}</strong> {t.twoWays.direct.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.twoWays.matched.label}</strong> {t.twoWays.matched.body}
        </DocsListItem>
      </DocsList>

      <DocsH2>{t.getStarted.title}</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>{t.getStarted.signIn.label}</strong> {t.getStarted.signIn.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.getStarted.fund.label}</strong> {t.getStarted.fund.body}
        </DocsListItem>
        <DocsListItem>
          <strong>{t.getStarted.open.label}</strong> {t.getStarted.open.body}
        </DocsListItem>
      </DocsList>

      <DocsH2>{t.next.title}</DocsH2>
      <DocsP>{t.next.lede}</DocsP>
      <div className="mt-6 grid sm:grid-cols-2 gap-3 max-w-[64ch]">
        <DocsCardLink
          href="/docs/agents"
          title={t.next.cards.agents.title}
          blurb={t.next.cards.agents.blurb}
        />
        <DocsCardLink
          href="/docs/deals"
          title={t.next.cards.deals.title}
          blurb={t.next.cards.deals.blurb}
        />
        <DocsCardLink
          href="/docs/reputation"
          title={t.next.cards.reputation.title}
          blurb={t.next.cards.reputation.blurb}
        />
        <DocsCardLink
          href="/docs/bridge"
          title={t.next.cards.bridge.title}
          blurb={t.next.cards.bridge.blurb}
        />
        <DocsCardLink
          href="/docs/roadmap"
          title={t.next.cards.roadmap.title}
          blurb={t.next.cards.roadmap.blurb}
        />
        <DocsCardLink
          href="/docs/faq"
          title={t.next.cards.faq.title}
          blurb={t.next.cards.faq.blurb}
        />
      </div>
    </article>
  );
}

function DocsCardLink({
  href,
  title,
  blurb,
}: {
  href: string;
  title: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className="group block p-4 bg-[var(--lp-card)] border border-[var(--lp-border-light)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.18)]"
      style={{
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)]"
        />
        <span className="font-sans text-[15px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
          {title}
        </span>
        <span
          aria-hidden
          className="ms-auto text-[var(--lp-text-muted)] transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-[var(--lp-text-sub)]">{blurb}</p>
    </Link>
  );
}
