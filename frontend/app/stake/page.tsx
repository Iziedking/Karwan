'use client';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';
import { SignInGate } from '@/shared/components/SignInGate';
import { StakeCard } from '@/features/reputation/components/StakeCard';
import { useAuth } from '@/shared/hooks/useAuth';

/// Standalone flagship Stake page. Lives in the top navbar so prospects,
/// judges, and existing users have a dedicated surface for the staking story
/// (not just an embedded card on /profile, which stays as the dashboard
/// widget). The page itself is gated behind sign-in per user direction;
/// non-connected visitors see the SignInGate. Authed visitors get a dark
/// hero band naming KarwanVault + the USYC mainnet narrative, then the
/// existing StakeCard rendered on a light band below.
export default function StakePage() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <SignInGate
        tag="STAKE"
        title={
          <>
            Earn <Accent>reputation</Accent>
            <Punc>.</Punc>
          </>
        }
        body={
          <>
            Deposit USDC into KarwanVault. The longer it sits, the more reputation it earns. On mainnet the same stake earns yield through Hashnote USYC.
          </>
        }
        buttonLabel="Log in to stake"
      />
    );
  }

  return (
    <FullBleed>
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[60ch] fade-up">
          <SectionTag tone="dark" dot="live">
            STAKE
          </SectionTag>
          <HeroHeadline size="lg">
            Earn <Accent>reputation</Accent>
            <Punc>.</Punc>{' '}
            <br className="hidden md:block" />
            Earn <Accent>yield</Accent>
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-7 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[50ch]">
            Stake USDC. The longer it sits, the more reputation it earns. Withdraw any time. 7-day cool-down on the way out.
          </p>
          <p className="mt-5 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-relaxed">
            // ON MAINNET THIS STAKE ROUTES THROUGH HASHNOTE USYC FOR ~5% APY
          </p>
        </div>
      </Band>

      {/* STAKE INTERFACE — same StakeCard rendered on /profile. The card
          itself handles deposit, withdraw, cooling positions, and the
          claim flow once the 7-day cool-down elapses. */}
      <Band tone="light" compact>
        <SectionTag>YOUR STAKE</SectionTag>
        <HeroHeadline size="md">
          Vault<Punc>.</Punc>
        </HeroHeadline>
        <div className="mt-10">
          <StakeCard />
        </div>
      </Band>
    </FullBleed>
  );
}
