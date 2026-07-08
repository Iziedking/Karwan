'use client';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { isBusinessAccount } from '@/features/account/accountKind';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { PartnersBrowse } from '@/features/partners/components/PartnersBrowse';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  CTAPill,
} from '@/shared/components/Bands';

export default function PartnersPage() {
  return (
    <AuthGuard gateTag="PARTNERS" gateBody="Sign in to browse business partners on Karwan.">
      <PartnersInner />
    </AuthGuard>
  );
}

function PartnersInner() {
  const { profile } = useUserProfile();
  const isBusiness = isBusinessAccount(profile);

  // Partner discovery is a B2B surface. An individual on the P2P rail uses the
  // market (offers) instead, so send them there rather than an empty directory.
  if (!SME_TRADES_ENABLED || !isBusiness) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[46ch]">
            <SectionTag tone="dark">PARTNERS</SectionTag>
            <HeroHeadline size="md">
              For businesses<Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              Partner discovery lists companies on the SME rail. Register as a
              business to source and trade with fellow companies. Individuals
              browse the market for offers instead.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/profile">Register a business</CTAPill>
              <CTAPill href="/market" variant="secondary" tone="dark">
                Browse the market
              </CTAPill>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  return <PartnersBrowse />;
}
