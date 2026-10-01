'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useActivation } from '@/shared/hooks/useActivation';
import { useAuth } from '@/shared/hooks/useAuth';
import { DepositCard } from '@/features/deposit/components/DepositCard';
import { BridgeCard } from '@/features/bridge/components/BridgeCard';
import { BridgeHistoryModal } from '@/features/bridge/components/BridgeHistorySection';
import { GatewayBalanceCard } from '@/features/bridge/components/GatewayBalanceCard';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { NetworkHint } from '@/shared/components/NetworkContext';
import { RailSlider } from '@/features/deposit/components/RailSlider';
import { PageTour } from '@/shared/guide/PageTour';
import { BRIDGE_TOUR_ID, buildBridgeSteps } from '@/shared/guide/tours';
import {
  defaultRail,
  railsFor,
  reconcileRail,
  type MoneyIntent,
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
          background: 'var(--surface)',
          borderRadius: 20,
        }}
      />
    ),
  },
);
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { CrossChainPage } from '@/features/bridge/components/CrossChainFlow';
import { moneyV2Enabled } from '@/features/money/moneySwitch';
import {
  FullBleed,
  Band,
} from '@/shared/components/Bands';

type Direction = 'in' | 'out';

/// Add, Gateway withdrawal and direct withdrawal are separate tasks. The
/// account action chooses the task before this page renders a rail, so a user
/// never has to understand Gateway and direct withdrawal as competing methods.
export default function BridgePage() {
  return (
    <Suspense fallback={<BridgePageFallback />}>
      <BridgePageContent />
    </Suspense>
  );
}

function BridgePageContent() {
  const t = useTranslations().bridge;
  const params = useSearchParams();
  if (moneyV2Enabled(process.env.NEXT_PUBLIC_MONEY_V2, `?${params.toString()}`)) return <CrossChainPage />;
  const publicRecipient = params.get('recipient');
  const isPublicPayment = !!publicRecipient && /^0x[a-fA-F0-9]{40}$/.test(publicRecipient);
  if (isPublicPayment) return <BridgePageInner />;
  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <BridgePageInner />
    </AuthGuard>
  );
}

function BridgePageFallback() {
  return (
    <div className="product-surface">
      <FullBleed>
        <Band tone="light" compact>
          <div
            aria-hidden
            className="motion-safe:animate-pulse motion-reduce:animate-none"
            style={{
              minHeight: 220,
              background: 'var(--surface)',
              borderRadius: 20,
            }}
          />
        </Band>
      </FullBleed>
    </div>
  );
}

function BridgePageInner() {
  const messages = useTranslations();
  const c = messages.bridgeChooser;
  const { agents } = useActivation();
  const { method } = useAuth();
  const params = useSearchParams();
  const requestedDirection = params.get('direction');
  const requestedIntent = params.get('intent');
  const outIntent = requestedIntent === 'send' ? 'send' : requestedIntent === 'move' ? 'move' : null;
  const requestedRecipient = params.get('recipient') ?? undefined;
  const publicPayment = !!requestedRecipient && /^0x[a-fA-F0-9]{40}$/.test(requestedRecipient);
  const requestedAmountRaw = params.get('amount');
  const requestedAmount = requestedAmountRaw && Number.isFinite(Number(requestedAmountRaw)) && Number(requestedAmountRaw) > 0
    ? Number(requestedAmountRaw)
    : undefined;
  const [direction, setDirection] = useState<Direction>(requestedDirection === 'out' ? 'out' : 'in');
  const [historyOpen, setHistoryOpen] = useState(false);
  const moneyIntent: MoneyIntent | undefined = direction === 'out' && outIntent ? outIntent : undefined;

  useEffect(() => {
    if (requestedDirection === 'in' || requestedDirection === 'out') {
      setDirection(requestedDirection);
    }
  }, [requestedDirection]);

  // Which rails exist for this account and this direction lives in railModel,
  // not here. Both account types get the same chooser now: an email account used
  // to see no choice at all, which meant the pooled balance and the card route
  // were invisible to the people most likely to want them.
  const rails = useMemo(
    () => railsFor({ method: publicPayment ? 'web3' : method === 'circle' ? 'circle' : method ? 'web3' : null, direction, intent: moneyIntent }),
    [method, direction, moneyIntent, publicPayment],
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

  const header = messages.bridge.header;
  const pageTitle = direction === 'in'
    ? messages.account.page.add
    : outIntent === 'move' ? header.titleMove : header.titleOut;
  const pageBody = direction === 'in'
    ? header.bodyIn
    : outIntent === 'move' ? messages.account.page.moveHelp : header.bodyOut;

  return (
    <div className="product-surface">
    <FullBleed>
      {/* The page owns its tour. It used to live inside the Transfer card, which
          is one of four rails, so the Tour pill appeared and disappeared as the
          user switched rails and was absent entirely for an email account, which
          lands on Direct. */}
      <PageTour id={BRIDGE_TOUR_ID} steps={buildBridgeSteps({ direction, rail })} />
      <Band tone="light" compact>
        <header className="max-w-[620px] pb-5">
          <p className="text-[13px] text-[var(--ink-secondary)]">{messages.accountHome.balanceLabel}</p>
          <h1 className="mt-1 text-[32px] sm:text-[40px] font-medium leading-[1.1] tracking-[-0.015em] text-[var(--ink)]">{pageTitle}<NetworkHint /></h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{pageBody}</p>
        </header>
      </Band>

      <Band tone="light" compact className="!pt-0 md:!pt-0">
        <div className="max-w-xl">
          {/* Direction first, rail second. Which way the money goes is the
              question every account has; which rail carries it depends on the
              answer, and two of the four only exist in one direction. */}
          <div className="mb-6 grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
            <div
              data-guide="bridge-direction"
              className="flex w-full p-1 sm:w-auto"
              style={{
                background: 'var(--tint)',
                borderRadius: 999,
              }}
            >
              <DirToggle active={direction === 'in'} onClick={() => setDirection('in')}>
                {messages.account.page.add}
              </DirToggle>
              <DirToggle active={direction === 'out'} onClick={() => setDirection('out')}>
                {outIntent === 'move' ? header.titleMove : header.titleOut}
              </DirToggle>
            </div>
            <div data-guide="bridge-history" className="w-full sm:w-auto">
              <HistoryButton onClick={() => setHistoryOpen(true)} label={c.transferHistory} />
            </div>
          </div>

          <div data-guide="bridge-rails">
            <RailSlider rails={rails} active={rail} onChange={setRail}>
              <RailPanel
                rail={rail}
                direction={direction}
                state={rails.find((option) => option.id === rail)?.state ?? 'ready'}
                agents={agents ?? undefined}
                prefillRecipient={requestedRecipient}
                prefillAmount={requestedAmount}
              />
            </RailSlider>
          </div>
        </div>
      </Band>

      <BridgeHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </FullBleed>
    </div>
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
  prefillRecipient,
  prefillAmount,
}: {
  rail: DepositRail;
  direction: Direction;
  state: 'ready' | 'soon';
  agents: Parameters<typeof BridgeCard>[0]['agents'];
  prefillRecipient?: string;
  prefillAmount?: number;
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
  // Only an email or passkey account is ever offered this rail (see railModel),
  // so reaching it means there is an address to show.
  if (rail === 'direct') return <DepositCard />;
  // Gateway is the one rail that runs both ways, so it is told which way this
  // is. It used to show the pooling form and the send-anywhere form stacked in
  // one card whichever direction the page was set to.
  if (rail === 'gateway') return <GatewayBalanceCard direction={direction} />;
  // CCTP, both ways. The out card carries its own Solana branch.
  if (state === 'soon') {
    return <ComingSoonPanel body={copy.cctp.blurb} action={copy.cctp.title} soon={copy.soon} />;
  }
  return direction === 'in' ? (
    <BridgeCard agents={agents} prefillRecipient={prefillRecipient} prefillAmount={prefillAmount} />
  ) : <BridgeOutCard />;
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
      className="rounded-[20px] bg-[var(--surface)] p-5 sm:p-6"
      style={{
        background: 'var(--surface)',
          borderRadius: 20,
      }}
    >
      <span
        className="inline-flex rounded-full bg-[var(--tint)] px-3 py-1 text-[13px] text-[var(--ink-secondary)]"

      >
        {soon}
      </span>
      <p className="mt-4 text-[17px] font-medium text-[var(--ink)]">{action}</p>
      <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-[var(--ink-secondary)]">
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
      className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--tint)] px-5 py-3 text-[14px] font-medium text-[var(--ink)] transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] sm:w-auto"
      style={{
        background: 'var(--tint)',
        color: 'var(--ink)',
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
      className="min-h-12 flex-1 rounded-full px-4 py-3 text-[14px] font-medium transition-colors duration-[var(--dur-small)] ease-[var(--ease-ui)] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] sm:flex-none sm:px-5"
      style={{
        background: active ? 'var(--ink)' : 'transparent',
        color: active ? 'var(--canvas)' : 'var(--ink-secondary)',
      }}
    >
      {children}
    </button>
  );
}
