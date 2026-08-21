'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useActivation } from '@/shared/hooks/useActivation';
import { useAuth } from '@/shared/hooks/useAuth';
import { DepositCard } from '@/features/deposit/components/DepositCard';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { BridgeHistoryModal } from '@/features/bridge/components/BridgeHistorySection';
import { GatewayBalanceCard } from '@/features/bridge/components/GatewayBalanceCard';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { LpHint } from '@/shared/components/LpHint';
import { RailSlider } from '@/features/deposit/components/RailSlider';
import {
  defaultRail,
  railsFor,
  reconcileRail,
  type DepositRail,
} from '@/features/deposit/railModel';

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
  const { method } = useAuth();
  const params = useSearchParams();
  const [direction, setDirection] = useState<Direction>('in');
  const [historyOpen, setHistoryOpen] = useState(false);

  // Which rails exist for this account and this direction lives in railModel,
  // not here. Both account types get the same chooser now: an email account used
  // to see no choice at all, which meant the pooled balance and the card route
  // were invisible to the people most likely to want them.
  const rails = useMemo(
    () => railsFor({ method: method === 'circle' ? 'circle' : method ? 'web3' : null, direction }),
    [method, direction],
  );

  const [rail, setRail] = useState<DepositRail>(() => defaultRail(rails));

  // A deep link (?rail=gateway from the agent-funding tiles) wins when the rail
  // is usable, and is ignored when it is not, so nobody lands on a coming-soon
  // notice as the first thing on the page.
  useEffect(() => {
    setRail((current) => defaultRail(rails, params.get('rail') ?? current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Flipping direction can retire the current rail: there is no direct-deposit
  // address on the way out.
  useEffect(() => {
    setRail((current) => reconcileRail(current, rails));
  }, [rails]);

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <SectionTag tone="dark">{t.sectionTag}</SectionTag>
        <HeroHeadline size="md">
          {t.headlinePrefix}<Accent>USDC</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[50ch]">
          {t.description}
        </p>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-xl">
          {/* Direction first, rail second. Which way the money goes is the
              question every account has; which rail carries it depends on the
              answer, and two of the four only exist in one direction. */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
            <HistoryButton onClick={() => setHistoryOpen(true)} label={c.transferHistory} />
          </div>

          <RailSlider rails={rails} active={rail} onChange={setRail}>
            <RailPanel
              rail={rail}
              direction={direction}
              state={rails.find((option) => option.id === rail)?.state ?? 'ready'}
              agents={agents ?? undefined}
            />
          </RailSlider>
        </div>
      </Band>

      <BridgeHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </FullBleed>
  );
}

/// The panel for one rail. Every branch is a component that already owns that
/// movement, including its own balance reads and its own errors; nothing is
/// re-implemented here to fit the chooser.
function RailPanel({
  rail,
  direction,
  state,
  agents,
}: {
  rail: DepositRail;
  direction: Direction;
  state: 'ready' | 'soon';
  agents: Parameters<typeof BridgeCard>[0]['agents'];
}) {
  const copy = useTranslations().depositRails;

  if (rail === 'onramp') {
    return (
      <ComingSoonPanel
        body={copy.onramp.body}
        action={direction === 'in' ? copy.onramp.inLabel : copy.onramp.outLabel}
        soon={copy.soon}
      />
    );
  }
  if (rail === 'direct') return <DepositCard />;
  if (rail === 'gateway') return <GatewayBalanceCard />;
  // CCTP, both ways. The out card carries its own Solana branch.
  if (state === 'soon') {
    return <ComingSoonPanel body={copy.cctp.blurb} action={copy.cctp.title} soon={copy.soon} />;
  }
  return direction === 'in' ? <BridgeCard agents={agents} tour /> : <BridgeOutCard />;
}

/// A rail that is real and not open yet. It says what it will do and offers no
/// control, because a disabled form is a worse lie than an honest sentence.
function ComingSoonPanel({
  body,
  action,
  soon,
}: {
  body: string;
  action: string;
  soon: string;
}) {
  return (
    <div
      className="p-6"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
      }}
    >
      <span
        className="inline-flex mono text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-1"
        style={{ background: 'var(--lp-accent)', color: 'var(--accent-ink)', borderRadius: 4 }}
      >
        {soon}
      </span>
      <p className="mt-4 text-[15px] font-bold tracking-[-0.01em] text-[var(--lp-dark)]">{action}</p>
      <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-[var(--lp-text-sub)]">
        {body}
      </p>
    </div>
  );
}

function HistoryButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono text-[11px] font-bold uppercase tracking-[0.1em] px-4 py-2 transition-colors hover:bg-[var(--lp-light)]"
      style={{
        background: 'transparent',
        color: 'var(--lp-dark)',
        border: '1px solid var(--lp-border-light)',
        borderRadius: 999,
      }}
    >
      {label}
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
