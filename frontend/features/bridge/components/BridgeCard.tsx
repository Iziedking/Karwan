'use client';
import { useEffect, useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useAuth } from '@/shared/hooks/useAuth';
import { api, ApiError } from '@/core/api';
import { SOURCE_CHAINS, GAS_FAUCETS, type SourceChainConfig } from '../config';
import { useBridges, type BridgePhase, type BridgeRecord } from '../hooks/useBridge';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';
import { ChainLogo, type ChainKey } from '@/shared/components/ChainLogo';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { PageTour } from '@/shared/guide/PageTour';
import { BRIDGE_TOUR_ID, BRIDGE_STEPS } from '@/shared/guide/tours';

const ARC_EXPLORER_TX = (h: string) => `https://testnet.arcscan.app/tx/${h}`;
const STUCK_AFTER_MS = 30 * 60 * 1000;
const STEP_ORDER: BridgePhase[] = ['approving', 'burning', 'attesting', 'minting', 'done'];

// Curated tones. match the deal palette so the bridge ties back visually.
const TONE_HEX = {
  live: 'var(--lp-accent)',
  positive: '#0a7553',
  critical: '#b03d3a',
  warning: '#b25425',
} as const;

const CARD_STYLE = {
  background: 'var(--lp-card)',
  color: 'var(--lp-dark)',
  border: '1px solid var(--lp-border-light)',
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 5,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.12)',
} as const;

function stepIndexFor(phase: BridgePhase): number {
  if (phase === 'error') return -1;
  if (phase === 'switching') return 0;
  if (phase === 'relaying') return 2;
  return STEP_ORDER.indexOf(phase);
}

function elapsed(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function phaseLabel(phase: BridgePhase, sourceShortName?: string): string {
  switch (phase) {
    case 'switching':
      return sourceShortName ? `Switching to ${sourceShortName}` : 'Switching chain';
    case 'approving':
      return 'Approving USDC';
    case 'burning':
      return 'Burning';
    case 'relaying':
      return 'Submitting to relay';
    case 'attesting':
      return 'Waiting for attestation';
    case 'minting':
      return 'Minting on Arc';
    case 'done':
      return 'Bridged';
    case 'error':
      return 'Failed';
  }
}

function phaseTone(phase: BridgePhase): 'live' | 'positive' | 'critical' {
  if (phase === 'done') return 'positive';
  if (phase === 'error') return 'critical';
  return 'live';
}

function ChainMark({ which, size = 22 }: { which: string; size?: number }) {
  return <ChainLogo chain={which as ChainKey} size={size} />;
}

function RouteGlyph({ from, size = 22 }: { from: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChainMark which={from} size={size} />
      <svg
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
        className="text-[var(--lp-text-muted)]"
      >
        <path
          d="M3 8h10M9 4l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <ChainMark which="arc" size={size} />
    </span>
  );
}

export function BridgeCard({
  mintRecipient,
  tour = true,
}: {
  mintRecipient?: `0x${string}`;
  /// Off when embedded in /profile so the Profile tour owns that page and the
  /// bridge tour doesn't fire there too. On for the standalone bridge surface.
  tour?: boolean;
}) {
  const { isConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const auth = useAuth();
  const isCircleUser = auth.method === 'circle';
  const { bridges, start, startCircle, retry, recheck, dismiss, clearCompleted, isActive } =
    useBridges();
  // This card only handles bridging IN. Out-records render in BridgeOutCard.
  const inBridges = bridges.filter((b) => b.direction !== 'out');
  const [sourceKey, setSourceKey] = useState<SourceChainConfig['key']>('baseSepolia');
  const [amount, setAmount] = useState<number | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // For Circle users we surface the source-chain DCW address the backend
  // provisioned (or lazy-provisions on first read) PLUS its live USDC + gas
  // balances, so the user can confirm their funds actually landed before
  // bridging. Resets + refetches when the source chain changes, and polls
  // every 15s so a freshly-sent deposit shows up without a manual refresh.
  const [circleWallet, setCircleWallet] = useState<{
    address: string;
    usdcBalance: string | null;
    gasBalance: string | null;
  } | null>(null);
  useEffect(() => {
    if (!isCircleUser || !auth.address) {
      setCircleWallet(null);
      return;
    }
    let cancelled = false;
    setCircleWallet(null);
    const load = () => {
      api
        .bridgeWalletStatus(auth.address as string, sourceKey)
        .then((r) => {
          if (!cancelled)
            setCircleWallet({
              address: r.bridgeWalletAddress,
              usdcBalance: r.usdcBalance,
              gasBalance: r.gasBalance,
            });
        })
        .catch(() => {
          /* keep the prior value; the banner shows "checking" until first hit */
        });
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isCircleUser, auth.address, sourceKey]);

  const source = SOURCE_CHAINS[sourceKey];
  // The wagmi wallet may be on Arc (the user just funded an agent there) or on
  // any other chain. The bridge flow will switch it automatically, but the CTA
  // label tells the user that's about to happen so the wallet pop-up isn't a
  // surprise.
  const onWrongChain = isConnected && walletChainId !== source.chainId;

  // Split the button gate from "submit burn".
  //   - canSwitch: web3 user on wrong chain just needs an active wallet to
  //     trigger the chain switch. Amount + recipient don't matter for this.
  //   - canBurn:   web3 user on the correct chain, with amount + recipient.
  //   - canBridgeCircle: Circle user, amount + recipient (backend signs).
  // The button is enabled if any of these holds. Without this split, removing
  // the default amount left web3 users unable to click "Switch to Base"
  // until they typed an amount first, which makes no sense.
  const canSwitch = isConnected && onWrongChain && !isSwitching;
  const canBurn =
    isConnected &&
    !onWrongChain &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!mintRecipient &&
    !isSwitching;
  const canBridgeCircle =
    isCircleUser &&
    !!auth.address &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!mintRecipient;
  const canSubmit = canBridgeCircle || canSwitch || canBurn;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isCircleUser && auth.address) {
      if (!canBridgeCircle) return;
      // Backend signs both legs from the per-user source-chain DCW. No chain
      // switch, no wallet prompt. The record appears in the bridge list and
      // animates the same way once burnTxHash + attestation land.
      startCircle({
        sourceChainKey: sourceKey,
        amountUsdc: amount as number,
        mintRecipient: mintRecipient as `0x${string}`,
        userAddress: auth.address,
      });
      return;
    }
    if (onWrongChain) {
      if (!canSwitch) return;
      try {
        await switchChainAsync({ chainId: source.chainId });
      } catch {
        // User declined the wallet prompt. Stay on the same button.
      }
      return;
    }
    if (!canBurn || !mintRecipient) return;
    start({ sourceChainKey: sourceKey, amountUsdc: amount as number, mintRecipient });
  }

  if (!mintRecipient) {
    return (
      <div style={CARD_STYLE} className="p-6 h-full flex flex-col">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          [:BRIDGE:]
        </span>
        <p className="mt-3 text-[14px] text-[var(--lp-text-sub)]">
          Buyer agent not configured.
        </p>
      </div>
    );
  }

  const activeCount = inBridges.filter((b) => isActive(b.phase)).length;

  return (
    <div style={CARD_STYLE} className="h-full flex flex-col overflow-hidden">
      {tour && <PageTour id={BRIDGE_TOUR_ID} steps={BRIDGE_STEPS} />}
      <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            [:TOP UP AGENT:]
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
            Bridge to Arc
          </h2>
          <p className="mt-2 inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            <span>CCTP V2</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/circle-logo.png"
              alt="Circle"
              width={20}
              height={20}
              className="inline-block rounded-full shrink-0 object-cover"
              style={{ width: 20, height: 20 }}
            />
          </p>
        </div>
        {activeCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] mono font-bold uppercase tracking-[0.14em] shrink-0"
            style={{
              background: 'rgba(189, 225, 34,0.10)',
              color: 'var(--lp-dark)',
              border: '1px solid rgba(189, 225, 34,0.35)',
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 2,
            }}
          >
            <span className="relative flex size-1.5">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
                style={{ background: 'var(--lp-accent)' }}
              />
              <span
                className="relative inline-flex size-1.5 rounded-full"
                style={{ background: 'var(--lp-accent)' }}
              />
            </span>
            {activeCount} IN FLIGHT
          </span>
        )}
      </div>

      <div className="px-6 pb-6">
        {isCircleUser && (
          <CircleSourceFundBanner
            sourceChainKey={sourceKey}
            wallet={circleWallet}
          />
        )}
        {!isCircleUser && isConnected && <Web3FundHint source={source} />}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* SOURCE CHAIN PICKER */}
          <div data-guide="bridge-source">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              [:SOURCE CHAIN:]
            </span>
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.values(SOURCE_CHAINS) as SourceChainConfig[]).map((c) => {
                const active = sourceKey === c.key;
                return (
                  <button
                    type="button"
                    key={c.key}
                    onClick={() => setSourceKey(c.key)}
                    aria-pressed={active}
                    className="relative overflow-hidden text-left pl-4 pr-3.5 py-3 transition-colors"
                    style={{
                      background: active ? 'rgba(189, 225, 34,0.10)' : 'var(--lp-card)',
                      color: 'var(--lp-dark)',
                      border: active
                        ? '1px solid var(--lp-accent)'
                        : '1px solid var(--lp-border-light)',
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 3,
                      boxShadow: active ? '0 1px 0 rgba(189, 225, 34,0.18)' : 'none',
                    }}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-[3px]"
                        style={{ background: 'var(--lp-accent)' }}
                      />
                    )}
                    {active && (
                      <span
                        aria-hidden
                        data-instrument-blink
                        className="absolute top-2 right-2 inline-block w-[6px] h-[6px]"
                        style={{
                          background: 'var(--lp-accent)',
                          animation: 'instrumentBlink 1.6s ease-in-out infinite',
                        }}
                      />
                    )}
                    <div className="flex items-center gap-2.5">
                      <ChainMark which={c.key} size={26} />
                      <div className="min-w-0">
                        <p className="font-sans text-[13px] font-semibold tracking-tight leading-tight">
                          {c.name.replace(' Sepolia', '')}
                        </p>
                        <p
                          className="text-[10px] mono mt-0.5 uppercase tracking-[0.12em]"
                          style={{ color: 'var(--lp-text-muted)' }}
                        >
                          Sepolia · d{c.domain}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AMOUNT INPUT */}
          <div
            data-guide="bridge-amount"
            className="bridge-amount transition-shadow"
            style={{
              background: 'var(--lp-card)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            <div className="px-4 pt-3 pb-0.5 flex items-baseline justify-between">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                [:AMOUNT:]
              </span>
              <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                USDC · 6 decimals
              </span>
            </div>
            <div className="px-4 pb-3 flex items-baseline gap-3">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="no-spinner flex-1 bg-transparent font-sans text-[32px] font-extrabold tracking-[-0.025em] tabular-nums focus:outline-none placeholder:text-[var(--lp-text-muted)] min-w-0 text-[var(--lp-dark)]"
                placeholder="0"
              />
              <span className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] font-semibold">
                USDC
              </span>
            </div>
            <style jsx>{`
              .bridge-amount:focus-within {
                border-color: var(--lp-dark);
                box-shadow: 0 0 0 3px rgba(189, 225, 34, 0.25);
              }
            `}</style>
          </div>

          {/* MINTS TO */}
          <div
            className="px-4 py-3 flex items-center gap-3"
            style={{
              background: 'var(--lp-light)',
              border: '1px dashed rgba(0,0,0,0.18)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            <WalletAvatar address={mintRecipient} size={26} />
            <div className="flex-1 min-w-0">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                [:MINTS TO:]
              </span>
              <p className="mt-0.5 text-[13px] mono tabular-nums truncate text-[var(--lp-dark)]">
                {shortAddress(mintRecipient)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)] shrink-0">
              <ChainMark which="arc" size={16} />
              <span>Arc Testnet</span>
            </div>
          </div>

          {/* SUBMIT */}
          <button
            type="submit"
            data-guide="bridge-submit"
            disabled={!canSubmit}
            className="group relative w-full px-4 py-3 mono text-[13px] font-bold uppercase tracking-[0.08em] inline-flex items-center justify-center gap-2 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
            style={{
              background: 'var(--lp-accent)',
              color: 'var(--lp-dark)',
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 4,
              boxShadow: canSubmit ? '0 4px 0 rgba(0,0,0,0.22)' : 'none',
            }}
          >
            {isCircleUser || isConnected ? (
              <>
                <span>
                  {isCircleUser
                    ? `Bridge from ${source.shortName}`
                    : isSwitching
                      ? `Switching to ${source.shortName}…`
                      : onWrongChain
                        ? `Switch to ${source.shortName}`
                        : `Bridge from ${source.shortName}`}
                </span>
                <span
                  aria-hidden
                  className="inline-flex transition-transform group-hover:translate-x-0.5"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8h10M9 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </>
            ) : (
              'Connect wallet to bridge'
            )}
          </button>
        </form>

        {inBridges.length > 0 && (
          <div className="mt-7 pt-5 border-t border-[var(--lp-border-light)]">
            <div className="flex items-baseline justify-between gap-3 mb-3.5">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                [:ACTIVITY:]
              </span>
              <div className="flex items-baseline gap-3">
                {inBridges.some((b) => !isActive(b.phase)) && (
                  <button
                    type="button"
                    onClick={clearCompleted}
                    className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                    title="Remove finished and failed bridges from your local history. Active bridges are kept."
                  >
                    Clear history
                  </button>
                )}
                <p className="text-[10px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                  {inBridges.length} {inBridges.length === 1 ? 'BRIDGE' : 'BRIDGES'}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {inBridges.map((b) => (
                <BridgeRow
                  key={b.id}
                  bridge={b}
                  expanded={expandedId === b.id}
                  onToggle={() => setExpandedId(expandedId === b.id ? null : b.id)}
                  onRetry={() => retry(b.id)}
                  onRecheck={() => recheck(b.id)}
                  onDismiss={() => dismiss(b.id)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function BridgeRow({
  bridge,
  expanded,
  onToggle,
  onRetry,
  onRecheck,
  onDismiss,
}: {
  bridge: BridgeRecord;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onRecheck: () => void;
  onDismiss: () => void;
}) {
  const source = SOURCE_CHAINS[bridge.sourceChainKey];
  const tone = phaseTone(bridge.phase);
  const idx = stepIndexFor(bridge.phase);
  const isStuck =
    (bridge.phase === 'attesting' || bridge.phase === 'minting') &&
    Date.now() - bridge.startedAt > STUCK_AFTER_MS;

  const railColor =
    tone === 'positive'
      ? TONE_HEX.positive
      : tone === 'critical'
        ? TONE_HEX.critical
        : 'var(--lp-accent)';
  return (
    <li
      className="relative overflow-hidden transition-shadow"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
        boxShadow: expanded
          ? '0 1px 0 rgba(0,0,0,0.04), 0 10px 28px -14px rgba(0,0,0,0.22)'
          : '0 1px 0 rgba(0,0,0,0.03), 0 6px 18px -14px rgba(0,0,0,0.14)',
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: railColor }}
      />
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 pl-4 flex items-center gap-3"
      >
        <RouteGlyph from={bridge.sourceChainKey} size={22} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-sans text-[18px] font-extrabold tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(bridge.amountUsdc, { withSuffix: false })}
            </span>
            <span className="text-[10px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-none">
              USDC
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <PhaseChip tone={tone} label={phaseLabel(bridge.phase, source.shortName)} />
            <span className="text-[10px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-none tabular-nums">
              {elapsed(bridge.startedAt)}
            </span>
            {isStuck && (
              <span
                className="text-[10px] mono uppercase tracking-[0.14em] leading-none px-1.5 py-0.5 font-bold"
                style={{
                  background: 'rgba(178,84,37,0.10)',
                  color: TONE_HEX.warning,
                  border: '1px solid rgba(178,84,37,0.30)',
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  borderBottomLeftRadius: 4,
                  borderBottomRightRadius: 2,
                }}
              >
                STALE
              </span>
            )}
          </div>
        </div>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className={`text-[var(--lp-text-muted)] transition-transform shrink-0 ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="px-3 pb-3">
        <SegmentedProgress idx={idx} tone={tone} />
      </div>

      {expanded && (
        <div className="border-t border-[var(--lp-border-light)] px-3 py-3 space-y-3">
          <BridgeSteps bridge={bridge} />

          {bridge.error && <ErrorBanner message={bridge.error} />}

          {(bridge.burnTxHash || bridge.mintTxHash) && (
            <div className="space-y-1.5">
              {bridge.burnTxHash && (
                <a
                  href={source.explorerTx(bridge.burnTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline justify-between gap-3 text-[11px] hover:text-[var(--lp-dark)] text-[var(--lp-text-sub)] py-0.5 transition-colors"
                >
                  <span className="mono uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    BURN · {source.shortName.toUpperCase()}
                  </span>
                  <span className="mono inline-flex items-center gap-1 tabular-nums">
                    {shortHash(bridge.burnTxHash)}
                    <ExternalIcon />
                  </span>
                </a>
              )}
              {bridge.mintTxHash && (
                <a
                  href={ARC_EXPLORER_TX(bridge.mintTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline justify-between gap-3 text-[11px] hover:text-[var(--lp-dark)] text-[var(--lp-text-sub)] py-0.5 transition-colors"
                >
                  <span className="mono uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    MINT · ARC
                  </span>
                  <span className="mono inline-flex items-center gap-1 tabular-nums">
                    {shortHash(bridge.mintTxHash)}
                    <ExternalIcon />
                  </span>
                </a>
              )}
            </div>
          )}

          {isStuck && (
            <p className="text-[11px] text-[var(--lp-text-muted)] leading-snug">
              This bridge has been waiting far longer than the usual 10 to 19 minutes. The relay
              was likely interrupted, or the mint already landed and this card missed the event.
              Dismissing it only clears the card; the burn on chain and any mint are unaffected.
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            {(isStuck || bridge.phase === 'error') && (
              <button
                type="button"
                onClick={onRecheck}
                className="px-3 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors"
                style={{
                  background: 'var(--lp-accent)',
                  color: 'var(--lp-dark)',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 2,
                }}
              >
                Recheck on chain
              </button>
            )}
            {bridge.phase === 'error' && (
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1.5 mono text-[11px] font-bold uppercase tracking-[0.08em] transition-opacity hover:opacity-90"
                style={{
                  background: 'var(--lp-band-dark)',
                  color: 'white',
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 2,
                }}
              >
                Retry from start
              </button>
            )}
            {(bridge.phase === 'done' || bridge.phase === 'error' || isStuck) && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-1.5 mono text-[11px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-card)] transition-colors rounded"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function SegmentedProgress({ idx, tone }: { idx: number; tone: 'live' | 'positive' | 'critical' }) {
  const segments = ['Approve', 'Burn', 'Attest', 'Mint'];
  const fillColor =
    tone === 'positive'
      ? TONE_HEX.positive
      : tone === 'critical'
        ? TONE_HEX.critical
        : 'var(--lp-accent)';

  return (
    <div className="flex items-center gap-1">
      {segments.map((label, i) => {
        const done = idx > i || tone === 'positive';
        const active = idx === i && tone === 'live';
        const failed = tone === 'critical' && idx === i;
        return (
          <div
            key={label}
            className="relative flex-1 h-[3px] overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.08)' }}
          >
            <span
              className="absolute inset-0 transition-all duration-500"
              style={{
                background: done || failed ? fillColor : 'transparent',
                width: '100%',
              }}
            />
            {active && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1/2"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${fillColor} 50%, transparent 100%)`,
                  animation: 'bridgeShimmer 1.6s ease-in-out infinite',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BridgeSteps({ bridge }: { bridge: BridgeRecord }) {
  const source = SOURCE_CHAINS[bridge.sourceChainKey];
  const idx = stepIndexFor(bridge.phase);
  const errored = bridge.phase === 'error';
  const steps: Array<{ key: BridgePhase; label: string; hint?: string }> = [
    { key: 'approving', label: `Approve · ${source.shortName}` },
    { key: 'burning', label: `Burn · ${source.shortName}` },
    { key: 'attesting', label: 'Circle attestation', hint: '~10–19 MIN' },
    { key: 'minting', label: 'Mint · Arc' },
  ];

  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const stepIdx = STEP_ORDER.indexOf(s.key);
        const done = !errored && (idx > stepIdx || bridge.phase === 'done');
        const active = !errored && idx === stepIdx;
        const failedHere = errored && idx === stepIdx;
        const isLast = i === steps.length - 1;
        const tileBg = done
          ? TONE_HEX.positive
          : active
            ? 'rgba(189, 225, 34,0.12)'
            : failedHere
              ? TONE_HEX.critical
              : 'var(--lp-card)';
        const tileBorder = done
          ? TONE_HEX.positive
          : active
            ? 'var(--lp-accent)'
            : failedHere
              ? TONE_HEX.critical
              : 'var(--lp-border-light)';
        const tileColor = done || failedHere ? 'white' : active ? 'var(--lp-dark)' : 'var(--lp-text-muted)';
        const ledColor = done
          ? TONE_HEX.positive
          : active
            ? 'var(--lp-accent)'
            : failedHere
              ? TONE_HEX.critical
              : 'rgba(0,0,0,0.10)';
        return (
          <li key={s.key} className="relative flex items-start gap-3 pb-3 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[13px] top-[26px] w-px"
                style={{
                  bottom: 0,
                  background: done ? TONE_HEX.positive : 'var(--lp-border-light)',
                }}
              />
            )}
            <span
              className="relative shrink-0 inline-flex items-center justify-center w-[26px] h-[26px] mono text-[10px] font-bold tabular-nums"
              style={{
                background: tileBg,
                color: tileColor,
                border: `1px solid ${tileBorder}`,
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex-1 min-w-0 pt-1 flex items-center justify-between gap-3 flex-wrap">
              <span
                className={`mono text-[11px] uppercase tracking-[0.14em] ${
                  done || active
                    ? 'text-[var(--lp-dark)] font-bold'
                    : 'text-[var(--lp-text-muted)] font-semibold'
                }`}
              >
                {s.label}
              </span>
              <div className="flex items-center gap-2">
                {active && s.hint && (
                  <span
                    className="mono text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5"
                    style={{
                      background: 'rgba(189, 225, 34,0.18)',
                      color: 'var(--lp-dark)',
                      border: '1px solid rgba(189, 225, 34,0.35)',
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                      borderBottomLeftRadius: 4,
                      borderBottomRightRadius: 2,
                    }}
                  >
                    {s.hint}
                  </span>
                )}
                <span
                  aria-hidden
                  data-instrument-blink={active || undefined}
                  className="shrink-0 inline-block w-[6px] h-[6px]"
                  style={{
                    background: ledColor,
                    animation: active
                      ? 'instrumentBlink 1.6s ease-in-out infinite'
                      : undefined,
                  }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="overflow-hidden"
      style={{
        background: 'var(--lp-card)',
        border: `1px solid ${TONE_HEX.critical}`,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
        boxShadow: `0 1px 0 rgba(176,61,58,0.18)`,
      }}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5"
        style={{ background: TONE_HEX.critical }}
      >
        <span aria-hidden className="inline-block w-[5px] h-[5px] bg-white" />
        <span className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-white">
          ERROR
        </span>
      </div>
      <p className="px-3 py-2.5 text-[13px] leading-snug text-[var(--lp-dark)]">{message}</p>
    </div>
  );
}

function PhaseChip({
  tone,
  label,
}: {
  tone: 'live' | 'positive' | 'critical';
  label: string;
}) {
  const fg =
    tone === 'positive'
      ? TONE_HEX.positive
      : tone === 'critical'
        ? TONE_HEX.critical
        : 'var(--lp-dark)';
  const bg =
    tone === 'positive'
      ? 'rgba(10,117,83,0.10)'
      : tone === 'critical'
        ? 'rgba(176,61,58,0.10)'
        : 'rgba(189, 225, 34,0.14)';
  const border =
    tone === 'positive'
      ? 'rgba(10,117,83,0.35)'
      : tone === 'critical'
        ? 'rgba(176,61,58,0.35)'
        : 'rgba(189, 225, 34,0.45)';
  const led =
    tone === 'positive'
      ? TONE_HEX.positive
      : tone === 'critical'
        ? TONE_HEX.critical
        : 'var(--lp-accent)';
  return (
    <span
      className="inline-flex items-stretch overflow-hidden mono text-[10px] font-bold uppercase tracking-[0.16em] leading-none"
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
        borderBottomLeftRadius: 5,
        borderBottomRightRadius: 2,
      }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center px-1.5"
        style={{ background: led }}
      >
        <span
          aria-hidden
          data-instrument-blink={tone === 'live' || undefined}
          className="inline-block w-[5px] h-[5px] bg-white"
          style={{
            animation: tone === 'live' ? 'instrumentBlink 1.6s ease-in-out infinite' : undefined,
          }}
        />
      </span>
      <span className="px-2 py-[6px]">{label}</span>
    </span>
  );
}

/// Source-chain DCW funding panel for Circle users. The user has a Circle DCW
/// on the selected source chain (provisioned at activation for Base Sepolia,
/// lazy-provisioned on first read for any other chain). They send USDC to it
/// once — from a faucet or any external wallet — and the backend signs burns
/// from it. We poll the live balance so the user can confirm their deposit
/// landed; an empty wallet is the #1 cause of "circle bridge doesn't work".
function CircleSourceFundBanner({
  sourceChainKey,
  wallet,
}: {
  sourceChainKey: SourceChainConfig['key'];
  wallet: { address: string; usdcBalance: string | null; gasBalance: string | null } | null;
}) {
  const [copied, setCopied] = useState(false);
  const address = wallet?.address ?? null;
  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore. clipboard can fail in unfocused tabs.
    }
  }
  const faucet =
    sourceChainKey === 'baseSepolia'
      ? { label: 'Base Sepolia USDC faucet', href: 'https://faucet.circle.com/' }
      : { label: 'Ethereum Sepolia USDC faucet', href: 'https://faucet.circle.com/' };

  // Funded state drives the banner accent + status line. usdcBalance null means
  // the balance read hasn't returned yet (or failed) — stay neutral.
  const usdc = wallet?.usdcBalance != null ? Number(wallet.usdcBalance) : null;
  const funded = usdc != null && usdc > 0;
  const empty = usdc != null && usdc <= 0;
  const accent = empty ? TONE_HEX.warning : 'var(--lp-accent)';

  const statusLine = !wallet
    ? 'Checking your source-chain wallet…'
    : empty
      ? 'This wallet is empty. Send testnet USDC here, then bridge.'
      : funded
        ? 'Funded. You can bridge now.'
        : 'Send USDC to this address first, then bridge.';

  return (
    <div
      className="relative mb-4 overflow-hidden"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
        boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: accent }}
      />
      <div className="px-4 py-3 pl-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 px-1.5 py-[3px] mono text-[9px] font-bold uppercase tracking-[0.16em] leading-none"
            style={{
              background: funded ? 'rgba(10,117,83,0.12)' : empty ? 'rgba(178,84,37,0.12)' : 'rgba(189, 225, 34, 0.18)',
              color: funded ? TONE_HEX.positive : empty ? TONE_HEX.warning : 'var(--lp-band-dark)',
              border: `1px solid ${funded ? 'rgba(10,117,83,0.35)' : empty ? 'rgba(178,84,37,0.35)' : 'var(--lp-accent)'}`,
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              borderBottomLeftRadius: 4,
              borderBottomRightRadius: 2,
            }}
          >
            <span aria-hidden className="inline-block w-[5px] h-[5px]" style={{ background: accent }} />
            {funded ? 'FUNDED' : 'FUND TO BRIDGE'}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {statusLine}
          </span>
        </div>

        {/* LIVE BALANCE READOUT */}
        <div className="mt-3 flex items-baseline gap-4">
          <div>
            <p className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              Balance here
            </p>
            <p className="mt-0.5 font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
              {wallet?.usdcBalance == null ? '—' : formatUsdc(wallet.usdcBalance, { withSuffix: false })}
              <span className="ml-1 mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                USDC
              </span>
            </p>
          </div>
          {wallet?.gasBalance != null && Number(wallet.gasBalance) <= 0 && (
            <div>
              <p className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
                Gas
              </p>
              <p className="mt-0.5 mono text-[11px] tabular-nums leading-none" style={{ color: TONE_HEX.warning }}>
                0 ETH
              </p>
            </div>
          )}
        </div>

        {/* ADDRESS + ACTIONS */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              Your source-chain Circle address
            </p>
            <p className="mt-0.5 mono text-[12px] tabular-nums text-[var(--lp-dark)] truncate">
              {address ?? 'provisioning…'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={copyAddress}
              disabled={!address}
              className="mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] hover:opacity-80 transition-opacity disabled:opacity-50 px-2 py-1 border border-black/15"
              style={{
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
                color: copied ? TONE_HEX.positive : undefined,
              }}
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
            <a
              href={faucet.href}
              target="_blank"
              rel="noreferrer"
              className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1 px-2 py-1"
              style={{
                background: 'var(--lp-accent)',
                color: 'var(--lp-band-dark)',
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
              title={faucet.label}
            >
              Faucet
              <ExternalIcon />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/// Web3 users sign their own source-chain burn, so they pay gas there. Gas
/// Station only sponsors Circle DCWs, so a connected wallet claims its own native
/// gas from a public faucet (the prominent link). USDC is the one part we can
/// pool in-app: Circle's faucet drips it straight to the connected wallet.
function Web3FundHint({ source }: { source: SourceChainConfig }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function pullUsdc() {
    if (!auth.address) return;
    setBusy(true);
    setNote(null);
    try {
      await api.fundSource(auth.address, source.key);
      setNote({
        kind: 'ok',
        text: `Test USDC sent to your wallet on ${source.name}. Lands in about a minute, then bridge.`,
      });
    } catch (err) {
      const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : null;
      setNote({ kind: 'err', text: detail ?? (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="relative mb-4 overflow-hidden px-4 py-3 pl-5"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'var(--lp-accent)' }}
      />
      <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        [:FUND {source.shortName.toUpperCase()} TO BRIDGE:]
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--lp-text-sub)]">
        You sign the burn on {source.name}, so your wallet needs {source.nativeSymbol} for gas.
        Claim gas from the faucet, then pull test USDC here.
      </p>
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <FaucetLink href={GAS_FAUCETS[source.key]}>Claim {source.nativeSymbol} gas</FaucetLink>
        <button
          type="button"
          onClick={pullUsdc}
          disabled={busy || !auth.address}
          className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1.5 px-2.5 py-1 border transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
          style={{
            borderColor: 'var(--lp-accent)',
            color: 'var(--lp-band-dark)',
            background: 'rgba(189, 225, 34, 0.18)',
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 2,
          }}
        >
          {busy ? 'Requesting' : 'Get test USDC'}
        </button>
      </div>
      {note && (
        <p
          className="mt-2 text-[11px] leading-snug"
          style={{ color: note.kind === 'err' ? TONE_HEX.warning : 'var(--lp-text-sub)' }}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}

function FaucetLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1 px-2 py-1"
      style={{
        background: 'var(--lp-accent)',
        color: 'var(--lp-band-dark)',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 2,
      }}
    >
      {children}
      <ExternalIcon />
    </a>
  );
}

function ExternalIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5.5 4.5h6v6M11 5l-6.5 6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
