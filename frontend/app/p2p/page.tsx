'use client';
import Link from 'next/link';
import { cn } from '@/shared/utils/cn';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { AccountGate } from '@/shared/components/AccountGate';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
} from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// P2P Trades is a plain nav item that lands here: a desk picker. The buyer and
/// seller desks each get a card; clicking one routes to its surface. Mirrors the
/// onboarding account-kind picker (cream + lime accent, asymmetric corners).
export default function P2PHubPage() {
  const t = useTranslations().nav;
  const p = t.p2pHub;
  return (
    <AuthGuard gateTag={p.eyebrow} gateBody={p.lede}>
      <AccountGate kind="person">
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="fade-up">
            <SectionTag tone="dark">{p.eyebrow}</SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline>
              {p.title}
              <Punc>.</Punc>
            </HeroHeadline>
          </div>
          <p className="fade-up fade-up-2 mt-5 max-w-[52ch] text-[15px] leading-relaxed text-white/55">
            {p.lede}
          </p>
        </Band>

        <Band tone="light" compact>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-5 fade-up">
            <DeskCard
              href="/buyer"
              tone="cream"
              title={t.tradesDropdown.buyerTitle}
              sub={t.tradesDropdown.buyerSub}
            />
            <DeskCard
              href="/seller"
              tone="accent"
              title={t.tradesDropdown.sellerTitle}
              sub={t.tradesDropdown.sellerSub}
            />
          </div>
        </Band>
      </FullBleed>
      </AccountGate>
    </AuthGuard>
  );
}

function DeskCard({
  href,
  tone,
  title,
  sub,
}: {
  href: string;
  tone: 'cream' | 'accent';
  title: string;
  sub: string;
}) {
  const surface =
    tone === 'accent'
      ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)]'
      : 'bg-[var(--lp-card)] text-[var(--lp-dark)] border border-[var(--lp-border-light)]';
  const subColor = tone === 'accent' ? 'text-[var(--lp-band-dark)]/85' : 'text-[var(--lp-text-sub)]';
  return (
    <Link
      href={href}
      className={cn(
        'group text-start p-6 sm:p-7 min-h-[180px] flex flex-col justify-between',
        'transition-[transform,box-shadow] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-16px_rgba(0,0,0,0.30)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2',
        surface,
      )}
      style={{
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
      }}
    >
      <div>
        <span className="block font-sans text-[24px] font-extrabold uppercase tracking-[-0.02em] leading-none">
          {title}
        </span>
        <span className={cn('mt-3 block text-[14px] leading-snug max-w-[34ch]', subColor)}>
          {sub}
        </span>
      </div>
      <span
        aria-hidden
        className="mt-6 inline-flex items-center mono text-[18px] opacity-70 transition-transform duration-200 group-hover:translate-x-1"
      >
        →
      </span>
    </Link>
  );
}
