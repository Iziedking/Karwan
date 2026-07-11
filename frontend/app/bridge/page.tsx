'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useActivation } from '@/shared/hooks/useActivation';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { BridgeHistoryModal } from '@/features/bridge/components/BridgeHistorySection';
import { GatewayBalanceCard } from '@/features/bridge/components/GatewayBalanceCard';
import { AuthGuard } from '@/shared/components/AuthGuard';

/// BridgeOutCard ships its own form, balance polling, and Solana branch, a
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
type Rail = 'gateway' | 'cctp';

/// One rail at a time, Gateway first.
///
/// Gateway is the more capable of the two: it pools USDC across chains and
/// spends to any of them on a single signature, with no gas anywhere. CCTP moves
/// one source chain to one destination and is the right tool for a one-off fast
/// transfer, so it sits behind a switch rather than competing for the same space.
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
  const c = useTranslations().bridgeChooser;
  const { agents } = useActivation();
  const params = useSearchParams();
  const [rail, setRail] = useState<Rail>('gateway');
  const [direction, setDirection] = useState<Direction>('in');
  const [historyOpen, setHistoryOpen] = useState(false);

  // ?rail=cctp deep-links the bridge. The Gateway top-up buttons elsewhere in
  // the app open ?rail=gateway when the pool is short, which is already default,
  // but honour it explicitly so the link keeps working if the default changes.
  useEffect(() => {
    const r = params.get('rail');
    if (r === 'cctp' || r === 'gateway') setRail(r);
  }, [params]);

  const gateway = rail === 'gateway';

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
          <RailSwitch rail={rail} onChange={setRail} copy={c} />

          {/* Nudge, CCTP only. Gateway is the default and needs no defending;
              CCTP does, because the user has just stepped off the better rail. */}
          {!gateway && (
            <div
              className="mt-4 p-3 fade-up"
              style={{
                background: 'rgba(175, 201, 91, 0.10)',
                borderInlineStart: '2px solid var(--lp-accent)',
                borderRadius: 8,
              }}
            >
              <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
                {c.cctp.nudge}
              </p>
            </div>
          )}

          {/* key on the rail so the card remounts and the fade-up actually
              replays on every switch instead of only the first. */}
          <div key={rail} className="mt-6 fade-up">
            {gateway ? (
              <GatewayBalanceCard />
            ) : (
              <>
                <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
                  <div
                    className="inline-flex p-1"
                    style={{
                      background: 'var(--lp-card)',
                      border: '1px solid var(--lp-border-light)',
                      borderRadius: 999,
                    }}
                  >
                    <DirToggle
                      active={direction === 'in'}
                      onClick={() => setDirection('in')}
                    >
                      {t.directions.toArc}
                    </DirToggle>
                    <DirToggle
                      active={direction === 'out'}
                      onClick={() => setDirection('out')}
                    >
                      {t.directions.fromArc}
                    </DirToggle>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="mono text-[11px] font-bold uppercase tracking-[0.1em] px-4 py-2 transition-colors hover:bg-[var(--lp-light)]"
                    style={{
                      background: 'transparent',
                      color: 'var(--lp-dark)',
                      border: '1px solid var(--lp-border-light)',
                      borderRadius: 999,
                    }}
                  >
                    {c.transferHistory}
                  </button>
                </div>
                {direction === 'in' ? (
                  <BridgeCard agents={agents ?? undefined} tour />
                ) : (
                  <BridgeOutCard />
                )}
              </>
            )}
          </div>
        </div>
      </Band>

      <BridgeHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </FullBleed>
  );
}

/// The rail switch. Two labelled halves with a sliding lozenge behind the active
/// one, so moving between rails reads as one control rather than two buttons.
function RailSwitch({
  rail,
  onChange,
  copy,
}: {
  rail: Rail;
  onChange: (r: Rail) => void;
  copy: ReturnType<typeof useTranslations>['bridgeChooser'];
}) {
  const gateway = rail === 'gateway';
  return (
    <div>
      <div
        className="relative inline-flex p-1 w-full max-w-[420px]"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderRadius: 999,
        }}
      >
        {/* The lozenge itself. Absolutely positioned and translated, so the
            active state slides between the halves rather than cutting. */}
        <span
          aria-hidden
          className="absolute top-1 bottom-1 transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            width: 'calc(50% - 4px)',
            left: 4,
            borderRadius: 999,
            background: gateway ? 'var(--lp-accent)' : 'var(--lp-band-dark)',
            transform: gateway ? 'translateX(0)' : 'translateX(100%)',
          }}
        />
        <RailHalf active={gateway} dark={false} onClick={() => onChange('gateway')}>
          {copy.gateway.protocol}
        </RailHalf>
        <RailHalf active={!gateway} dark onClick={() => onChange('cctp')}>
          {copy.cctp.protocol}
        </RailHalf>
      </div>

      <div className="mt-5">
        <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
          {gateway ? copy.gateway.tag : copy.cctp.tag}
        </span>
        <h2 className="mt-2 text-[26px] leading-[1.1] font-extrabold uppercase tracking-tight text-[var(--lp-dark)]">
          {gateway ? copy.gateway.title : copy.cctp.title}
        </h2>
        <div className="mt-2 flex items-center gap-2">
          <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)]">
            {copy.poweredBy}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/circle-logo.png"
            alt="Circle"
            width={14}
            height={14}
            className="rounded-full shrink-0"
          />
          <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-dark)]">
            {gateway ? copy.gateway.protocol : copy.cctp.protocol}
          </span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--lp-text-sub)] max-w-[46ch]">
          {gateway ? copy.gateway.blurb : copy.cctp.blurb}
        </p>
      </div>
    </div>
  );
}

function RailHalf({
  active,
  dark,
  onClick,
  children,
}: {
  active: boolean;
  dark: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="relative z-10 flex-1 px-5 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.1em] rounded-full transition-colors"
      style={{
        background: 'transparent',
        color: active ? (dark ? 'white' : 'var(--lp-dark)') : 'var(--lp-text-sub)',
      }}
    >
      {children}
    </button>
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
