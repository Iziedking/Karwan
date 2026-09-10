'use client';

import Link from 'next/link';
import { DirectDealComposer } from '@/features/deals/components/DirectDealComposer';
import { ActivationGate } from '@/shared/components/ActivationGate';
import {
  Accent,
  Band,
  FullBleed,
  GridOverlay,
  HeroHeadline,
  PageCard,
  Punc,
  SectionTag,
} from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';

/// Business workspace trade desk. A business should never land on the
/// personal buyer auction surface. It needs three clear ways to trade:
/// discover supply, publish its own supply, or bring a known deal.
export function BusinessTradeDesk() {
  const t = useTranslations().businessTradeDesk;

  return (
    <FullBleed>
      <Band tone="dark" compact overlay={<GridOverlay />}>
        <div className="fade-up">
          <SectionTag tone="dark">{t.eyebrow}</SectionTag>
        </div>
        <div className="fade-up fade-up-1 max-w-[720px]">
          <HeroHeadline size="sm">
            {t.title.replace(/\.$/, '')}
            <Punc>.</Punc>
          </HeroHeadline>
        </div>
        <p className="fade-up fade-up-2 mt-5 max-w-[52ch] text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
          {t.description}
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <ActionCard href="/partners" title={t.findSupply} sub={t.findSupplySub} />
          <ActionCard href="/supply" title={t.postOffer} sub={t.postOfferSub} tone="accent" />
          <ActionCard href="#bring-a-deal" title={t.bringDeal} sub={t.bringDealSub} />
        </div>
      </Band>

      <Band tone="light" compact>
        <div id="bring-a-deal" className="scroll-mt-20" />
        <SectionTag>{t.openDeal}</SectionTag>
        <HeroHeadline as="h2" size="md">
          {t.bringDeal}
          <Accent>.</Accent>
        </HeroHeadline>
        <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
          {t.openDealDescription}
        </p>
        <div className="mt-8 max-w-4xl">
          <PageCard>
            <div className="p-6 md:p-8">
              <ActivationGate>
                <DirectDealComposer />
              </ActivationGate>
            </div>
          </PageCard>
        </div>
      </Band>
    </FullBleed>
  );
}

function ActionCard({
  href,
  title,
  sub,
  tone = 'dark',
}: {
  href: string;
  title: string;
  sub: string;
  tone?: 'dark' | 'accent';
}) {
  const accent = tone === 'accent';
  return (
    <Link
      href={href}
      className={cn(
        'group min-h-[178px] p-5 flex flex-col justify-between',
        'transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-dark)]',
        accent
          ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:shadow-[0_14px_36px_-16px_rgba(0,0,0,0.45)]'
          : 'border border-[var(--lp-workspace-border)] bg-[var(--lp-workspace-raised)] text-[var(--lp-workspace-ink)] hover:shadow-[0_14px_36px_-16px_rgba(0,0,0,0.45)]',
      )}
      style={{
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 4,
      }}
    >
      <span>
        <span className="block font-sans text-[20px] font-extrabold tracking-[-0.02em]">
          {title}
        </span>
        <span
          className={cn(
            'mt-2 block max-w-[28ch] text-[13px] leading-relaxed',
            accent ? 'text-[var(--lp-band-dark)]/80' : 'text-[var(--lp-workspace-muted)]',
          )}
        >
          {sub}
        </span>
      </span>
      <span
        aria-hidden
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-current text-[16px] opacity-65 transition-[transform,opacity] duration-200 group-hover:translate-x-1 group-hover:opacity-100"
      >
        →
      </span>
    </Link>
  );
}
