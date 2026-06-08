'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useActivation } from '@/shared/hooks/useActivation';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import {
  BridgeHistoryFilters,
  BridgeHistoryList,
  useBridgeHistory,
  type HistoryFilter,
} from '@/features/bridge/components/BridgeHistorySection';
import { AuthGuard } from '@/shared/components/AuthGuard';

/// BridgeOutCard ships its own form, balance polling, and Solana branch — a
/// chunky module that's never visible until the user toggles direction. Lazy
/// load it so the initial `/bridge` paint isn't paying for the out-flow JS.
const BridgeOutCard = dynamic(
  () =>
    import('@/features/bridge/components/BridgeOutCard').then((m) => ({
      default: m.BridgeOutCard,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="motion-safe:animate-pulse motion-reduce:animate-none"
        style={{
          minHeight: 520,
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
        }}
      />
    ),
  },
);
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
  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <BridgePageInner />
    </AuthGuard>
  );
}

function BridgePageInner() {
  const t = useTranslations().bridge;
  const { agents } = useActivation();
  const [direction, setDirection] = useState<Direction>('in');
  /// History filter lives at the page so the chip row (docked alongside the
  /// direction toggle) and the list (under the active card) share state.
  /// Counts come from the same hook so the chips always show truth.
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const { counts } = useBridgeHistory(historyFilter);

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
          {/* Direction toggle + history filter chips on one row. Toggle on
              the left controls which card is active; chips on the right
              filter the history list below by status. Both stack on small
              screens so the chip group wraps to its own line. */}
          <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
            <div
              className="inline-flex p-1"
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
            <BridgeHistoryFilters
              filter={historyFilter}
              onFilterChange={setHistoryFilter}
              counts={counts}
            />
          </div>

          {direction === 'in' ? (
            <BridgeCard agents={agents ?? undefined} tour />
          ) : (
            <BridgeOutCard />
          )}

          {/* Persistent history under the active card, in the same band so
              the page reads as a single surface. Filter chips up top drive
              what shows here. Survives the direction toggle — list shows
              both inbound + outbound regardless of which card is active. */}
          <div className="mt-8">
            <BridgeHistoryList filter={historyFilter} />
          </div>
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
