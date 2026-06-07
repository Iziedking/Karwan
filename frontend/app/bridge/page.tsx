'use client';
import { useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useActivation } from '@/shared/hooks/useActivation';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { BridgeOutCard } from '@/features/bridge/components/BridgeOutCard';
import { SignInGate } from '@/shared/components/SignInGate';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';

type Direction = 'in' | 'out';

export default function BridgePage() {
  const t = useTranslations().bridge;
  const { isAuthenticated } = useAuth();
  const { agents } = useActivation();
  const [direction, setDirection] = useState<Direction>('in');

  if (!isAuthenticated) {
    return (
      <SignInGate
        variant="page"
        tag={t.signInGate.tag}
        body={t.signInGate.body}
      />
    );
  }

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <SectionTag tone="dark">{t.sectionTag}</SectionTag>
        <HeroHeadline>
          {t.headlinePrefix}<Accent>USDC</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[50ch]">
          {t.description}
        </p>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-xl">
          {/* Direction toggle. Arc is always one side; this flips which. */}
          <div
            className="inline-flex p-1 mb-6"
            style={{
              background: 'var(--lp-card)',
              border: '1px solid var(--lp-border-light)',
              borderRadius: 999,
            }}
          >
            <DirToggle active={direction === 'in'} onClick={() => setDirection('in')}>
              {t.directions.toArc}
            </DirToggle>
            <DirToggle active={direction === 'out'} onClick={() => setDirection('out')}>
              {t.directions.fromArc}
            </DirToggle>
          </div>

          {direction === 'in' ? (
            <BridgeCard agents={agents ?? undefined} tour />
          ) : (
            <BridgeOutCard />
          )}
        </div>
      </Band>
    </FullBleed>
  );
}

function DirToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-5 py-2 mono text-[11px] font-bold uppercase tracking-[0.1em] rounded-full transition-colors"
      style={{
        background: active ? 'var(--lp-band-dark)' : 'transparent',
        color: active ? 'white' : 'var(--lp-text-sub)',
      }}
    >
      {children}
    </button>
  );
}
