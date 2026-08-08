'use client';
import Link from 'next/link';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { isBusinessAccount } from '@/features/account/accountKind';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ListingComposer } from '@/features/seller/components/ListingComposer';
import { BalancesCard } from '@/features/balances/components/BalancesCard';
import { ActivateAgentsNotice } from '@/shared/components/ActivateAgentsNotice';
import { PendingMatchesBand } from '@/features/notifications/components/PendingMatchesBand';
import { useActivation } from '@/shared/hooks/useActivation';
import { shortAddress } from '@/shared/utils/format';
import { PageTour } from '@/shared/guide/PageTour';
import { SUPPLY_TOUR_ID, SUPPLY_STEPS } from '@/shared/guide/tours';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  AddressPill,
  CTAPill,
  PageCard,
} from '@/shared/components/Bands';

/// The B2B sell side.
///
/// A business used to have no way to publish what it supplies: /seller is the
/// individual lane, and everything else assumed a buyer had already found the
/// company through Partners. That left a supplier with no partners invisible.
/// An offer posted here lands in the BUSINESS lane (deriveLane keys off the
/// account type), so the agents match it against business briefs and never
/// against the person-to-person pool.
export default function SupplyPage() {
  const sp = useTranslations().supplyPage;
  return (
    <AuthGuard gateTag={sp.signInGate.tag} gateBody={sp.signInGate.body}>
      <SupplyPageInner />
    </AuthGuard>
  );
}

function SupplyPageInner() {
  const { address } = useAuth();
  const { profile } = useUserProfile();
  const { activated, agents } = useActivation();
  const sp = useTranslations().supplyPage;

  // An individual posts on the P2P desk; this is the company book.
  if (!isBusinessAccount(profile)) {
    return (
      <FullBleed>
        <Band tone="dark" compact overlay={<GridOverlay />}>
          <div className="max-w-[46ch]">
            <SectionTag tone="dark">{sp.tag}</SectionTag>
            <HeroHeadline size="md">
              {sp.notBusiness.headline}
              <Punc>.</Punc>
            </HeroHeadline>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/seller" tone="dark">
                {sp.notBusiness.cta}
              </CTAPill>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  return (
    <FullBleed>
      <PageTour id={SUPPLY_TOUR_ID} steps={SUPPLY_STEPS} />
      <Band tone="dark" compact overlay={<GridOverlay />}>
        <div className="max-w-[52ch]">
          <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
            {sp.tag}
          </SectionTag>
          <HeroHeadline size="md">
            {sp.hero.headlinePrefix}
            <Accent>{sp.hero.headlineAccent}</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
            {sp.hero.lede}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <CTAPill href="#post-supply" tone="dark">
              {sp.hero.ctaPost}
            </CTAPill>
            <Link
              href="/partners"
              data-guide="supply-partners"
              className="mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--lp-accent)] hover:underline"
            >
              {sp.hero.ctaPartners}
            </Link>
            {address && (
              <span className="ms-1">
                <AddressPill address={shortAddress(address)} tone="dark" />
              </span>
            )}
          </div>
        </div>
      </Band>

      {/* Doubles as the tour's "your agent works both ways" anchor: it is the
          surface where an agent-found match actually lands. */}
      <div data-guide="supply-agent">
        <ActivateAgentsNotice role="seller" tone="light" />
        <PendingMatchesBand tone="light" headline={sp.matchesHeadline} />
      </div>

      <Band tone="light" compact>
        <div
          id="post-supply"
          data-guide="supply-post"
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start"
          style={{ scrollMarginTop: 80 }}
        >
          <PageCard tone="dark" className="min-w-0">
            <div className="p-6 md:p-8">
              <ListingComposer />
            </div>
          </PageCard>
          <div className="space-y-4 lg:sticky lg:top-24">
            <BalancesCard buyerAgent={agents?.buyer} sellerAgent={agents?.seller} />
          </div>
        </div>
      </Band>
    </FullBleed>
  );
}
