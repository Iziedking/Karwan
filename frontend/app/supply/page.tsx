'use client';
import Link from 'next/link';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { isBusinessAccount } from '@/features/account/accountKind';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { ListingComposer } from '@/features/seller/components/ListingComposer';
import { ActivateAgentsNotice } from '@/shared/components/ActivateAgentsNotice';
import { PendingMatchesBand } from '@/features/notifications/components/PendingMatchesBand';
import { useActivation } from '@/shared/hooks/useActivation';
import { shortAddress } from '@/shared/utils/format';
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
  return (
    <AuthGuard
      gateTag="SUPPLY"
      gateBody="Sign in to publish what your company supplies."
    >
      <SupplyPageInner />
    </AuthGuard>
  );
}

function SupplyPageInner() {
  const { address } = useAuth();
  const { profile } = useUserProfile();
  const { activated } = useActivation();

  // An individual posts on the P2P desk; this is the company book.
  if (!isBusinessAccount(profile)) {
    return (
      <FullBleed>
        <Band tone="dark" compact overlay={<GridOverlay />}>
          <div className="max-w-[46ch]">
            <SectionTag tone="dark">SUPPLY</SectionTag>
            <HeroHeadline size="md">
              This is the company desk<Punc>.</Punc>
            </HeroHeadline>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CTAPill href="/seller" tone="dark">
                Your seller desk
              </CTAPill>
            </div>
          </div>
        </Band>
      </FullBleed>
    );
  }

  return (
    <FullBleed>
      <Band tone="dark" compact overlay={<GridOverlay />}>
        <div className="max-w-[52ch]">
          <SectionTag tone="dark" dot={activated ? 'live' : undefined}>
            SUPPLY
          </SectionTag>
          <HeroHeadline size="md">
            Publish what you <Accent>supply</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
            Buyers find you, or your agent finds them.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <CTAPill href="#post-supply" tone="dark">
              Post an offer
            </CTAPill>
            <Link
              href="/partners"
              className="mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--lp-accent)] hover:underline"
            >
              Find partners →
            </Link>
            {address && (
              <span className="ms-1">
                <AddressPill address={shortAddress(address)} tone="dark" />
              </span>
            )}
          </div>
        </div>
      </Band>

      <ActivateAgentsNotice role="seller" tone="light" />
      <PendingMatchesBand tone="light" headline="Matches waiting on you" />

      <Band tone="light" compact>
        <div id="post-supply" style={{ scrollMarginTop: 80 }}>
          <ListingComposer />
        </div>
      </Band>
    </FullBleed>
  );
}
