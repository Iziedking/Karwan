'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
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

/// Two rails, two Circle products, shown as peers rather than one buried under
/// the other. CCTP moves USDC from a single source chain to Arc. Gateway pools
/// USDC across chains into one balance spendable anywhere. Different problems,
/// so the page opens either, or both side by side.
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
  const [direction, setDirection] = useState<Direction>('in');
  const [cctpOpen, setCctpOpen] = useState(false);
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
        <div className="max-w-6xl">
          {/* Each column owns its rail: the selector card, then that rail's own
              panel beneath it. Opening both therefore lands the two panels side
              by side with no extra layout branching. */}
          {/* items-stretch + flex-1 on each card: whichever rail is taller sets
              the height and the other matches, so the two never look ragged.
              Gateway has no direction toggle, so when CCTP is open it renders an
              invisible copy of that control row. Same markup, therefore exactly
              the same height, so both cards start on the same line without a
              magic-number spacer. */}
          <div className="grid gap-6 lg:grid-cols-2 items-stretch">
            <div className="flex flex-col">
              <RailCard
                tone="dark"
                open={cctpOpen}
                onToggle={() => setCctpOpen((v) => !v)}
                tag={c.cctp.tag}
                title={c.cctp.title}
                poweredBy={c.poweredBy}
                protocol={c.cctp.protocol}
                blurb={c.cctp.blurb}
              />
              {cctpOpen && (
                <div className="mt-6 flex flex-col flex-1">
                  <BridgeControls
                    direction={direction}
                    setDirection={setDirection}
                    onHistory={() => setHistoryOpen(true)}
                    toArc={t.directions.toArc}
                    fromArc={t.directions.fromArc}
                    historyLabel={c.transferHistory}
                  />
                  <div className="flex-1 [&>*]:h-full">
                    {direction === 'in' ? (
                      <BridgeCard agents={agents ?? undefined} tour />
                    ) : (
                      <BridgeOutCard />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col">
              <RailCard
                tone="lime"
                open={gatewayOpen}
                onToggle={() => setGatewayOpen((v) => !v)}
                tag={c.gateway.tag}
                title={c.gateway.title}
                poweredBy={c.poweredBy}
                protocol={c.gateway.protocol}
                blurb={c.gateway.blurb}
              />
              {gatewayOpen && (
                <div className="mt-6 flex flex-col flex-1">
                  {cctpOpen && (
                    <div aria-hidden className="invisible hidden lg:block">
                      <BridgeControls
                        direction={direction}
                        setDirection={() => {}}
                        onHistory={() => {}}
                        toArc={t.directions.toArc}
                        fromArc={t.directions.fromArc}
                        historyLabel={c.transferHistory}
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <GatewayBalanceCard agents={agents ?? undefined} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Band>

      <BridgeHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </FullBleed>
  );
}

/// CCTP's own controls: which way money flows, and its transfer history. They
/// belong to the bridge, not to Gateway, so they live inside the CCTP column.
/// The Gateway column renders an invisible copy purely to match the height.
function BridgeControls({
  direction,
  setDirection,
  onHistory,
  toArc,
  fromArc,
  historyLabel,
}: {
  direction: Direction;
  setDirection: (d: Direction) => void;
  onHistory: () => void;
  toArc: string;
  fromArc: string;
  historyLabel: string;
}) {
  return (
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
          {toArc}
        </DirToggle>
        <DirToggle active={direction === 'out'} onClick={() => setDirection('out')}>
          {fromArc}
        </DirToggle>
      </div>
      <button
        type="button"
        onClick={onHistory}
        className="mono text-[11px] font-bold uppercase tracking-[0.1em] px-4 py-2 transition-colors hover:bg-[var(--lp-light)]"
        style={{
          background: 'transparent',
          color: 'var(--lp-dark)',
          border: '1px solid var(--lp-border-light)',
          borderRadius: 999,
        }}
      >
        {historyLabel}
      </button>
    </div>
  );
}

/// The Buyer Desk / Seller Desk pattern: one dark, one lime, extrabold uppercase
/// title, circular arrow that turns down when the rail is open.
function RailCard({
  tone,
  open,
  onToggle,
  tag,
  title,
  poweredBy,
  protocol,
  blurb,
}: {
  tone: 'dark' | 'lime';
  open: boolean;
  onToggle: () => void;
  tag: string;
  title: string;
  poweredBy: string;
  protocol: string;
  blurb: string;
}) {
  const dark = tone === 'dark';
  const fg = dark ? '#fff' : 'var(--lp-dark)';
  const muted = dark ? 'rgba(255,255,255,0.58)' : 'rgba(0,0,0,0.58)';
  const hair = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full text-left p-7 transition-transform motion-safe:hover:-translate-y-0.5"
      style={{
        background: dark ? 'var(--lp-band-dark)' : 'var(--lp-accent)',
        color: fg,
        border: 'none',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 5,
      }}
    >
      <span
        className="mono text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: muted }}
      >
        {tag}
      </span>

      <h2 className="mt-3 text-[26px] leading-[1.1] font-extrabold uppercase tracking-tight">
        {title}
      </h2>

      <div className="mt-3 flex items-center gap-2">
        <span
          className="mono text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: muted }}
        >
          {poweredBy}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/circle-logo.png"
          alt="Circle"
          width={14}
          height={14}
          className="rounded-full shrink-0"
        />
        <span
          className="mono text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: fg }}
        >
          {protocol}
        </span>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed" style={{ color: muted }}>
        {blurb}
      </p>

      <span
        aria-hidden
        className="mt-5 inline-flex items-center justify-center transition-transform"
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          border: `1px solid ${hair}`,
          transform: open ? 'rotate(90deg)' : 'none',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke={fg}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
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
