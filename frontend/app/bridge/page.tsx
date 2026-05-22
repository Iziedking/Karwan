'use client';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { SignInGate } from '@/shared/components/SignInGate';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';

export default function BridgePage() {
  const { isAuthenticated } = useAuth();
  const { agents } = useActivation();

  if (!isAuthenticated) {
    return (
      <SignInGate
        variant="page"
        tag="BRIDGE"
        body="Bridging USDC in and out of Arc is keyed to your wallet. Sign in to continue."
      />
    );
  }

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <SectionTag tone="dark">BRIDGE</SectionTag>
        <HeroHeadline>
          Move <Accent>USDC</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[50ch]">
          Bring USDC to Arc from another chain, or send your Arc balance out. Native USDC over
          Circle CCTP. No wrapped tokens.
        </p>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-xl">
          <BridgeCard mintRecipient={agents?.buyer as `0x${string}` | undefined} tour />
        </div>
      </Band>
    </FullBleed>
  );
}
