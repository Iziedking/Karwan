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
} from '@/shared/components/Bands';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/// Business trade entry point. Keep the business action model distinct from
/// the personal P2P buyer and seller desks.
export default function B2BHubPage() {
  const t = useTranslations();
  const bt = t.businessTradeDesk;
  return (
    <AuthGuard gateTag={bt.eyebrow} gateBody={bt.description}>
      <AccountGate kind="business">
      <FullBleed>
        <Band tone="dark" compact overlay={<GridOverlay />}>
          <div className="fade-up">
              <SectionTag tone="dark">{bt.eyebrow}</SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline size="sm">
              {bt.title}
            </HeroHeadline>
          </div>
          <p className="fade-up fade-up-2 mt-4 max-w-[52ch] text-[15px] leading-relaxed text-[var(--lp-workspace-muted)]">
            {bt.description}
          </p>
        </Band>

        <Band tone="light" compact>
          <div className="grid gap-4 sm:grid-cols-3 sm:gap-5 fade-up">
            <DeskCard
              href="/partners"
              tone="cream"
              title={bt.findSupply}
              sub={bt.findSupplySub}
            />
            <DeskCard
              href="/supply"
              tone="accent"
              title={bt.postOffer}
              sub={bt.postOfferSub}
            />
            <DeskCard
              href="/buyer?mode=direct"
              tone="cream"
              title={bt.bringDeal}
              sub={bt.bringDealSub}
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
        className="mt-6 inline-flex items-center justify-center w-10 h-10 rounded-full border border-current text-[16px] opacity-50 transition-[transform,opacity] duration-200 group-hover:translate-x-1 group-hover:opacity-90"
      >
        →
      </span>
    </Link>
  );
}
