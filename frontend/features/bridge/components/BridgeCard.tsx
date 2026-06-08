'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useChainId, useSwitchChain, useBalance } from 'wagmi';
import { formatUnits, isAddress } from 'viem';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAddressKind } from '@/shared/hooks/useAddressKind';
import { api, ApiError } from '@/core/api';
import {
  SOURCE_CHAINS,
  APP_KIT_SOURCES,
  APP_KIT_SOURCE_KEYS,
  GAS_FAUCETS,
  USDC_FAUCET,
  isAppKitOnlyChainKey,
  type SourceChainConfig,
  type AppKitSourceConfig,
  type AnySourceChainKey,
  type CctpChainKey,
} from '../config';
import {
  useBridges,
  bridgeChainMeta,
  type BridgePhase,
  type BridgeRecord,
} from '../hooks/useBridge';
import { shortAddress, shortHash, formatUsdc } from '@/shared/utils/format';
import { ChainLogo, type ChainKey } from '@/shared/components/ChainLogo';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { PageTour } from '@/shared/guide/PageTour';
import { BRIDGE_TOUR_ID, BRIDGE_STEPS } from '@/shared/guide/tours';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';

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

function elapsed(ts: number, copy: { secondsTemplate: string; minutesTemplate: string; hoursTemplate: string }): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return copy.secondsTemplate.replace('{n}', String(s));
  const m = Math.floor(s / 60);
  if (m < 60) return copy.minutesTemplate.replace('{n}', String(m));
  const h = Math.floor(m / 60);
  return copy.hoursTemplate.replace('{h}', String(h)).replace('{m}', String(m % 60));
}

function phaseLabel(
  phase: BridgePhase,
  copy: {
    switchingTo: string;
    switchingChain: string;
    approving: string;
    burning: string;
    relaying: string;
    attesting: string;
    minting: string;
    done: string;
    error: string;
  },
  sourceShortName?: string,
): string {
  switch (phase) {
    case 'switching':
      return sourceShortName ? copy.switchingTo.replace('{chain}', sourceShortName) : copy.switchingChain;
    case 'approving':
      return copy.approving;
    case 'burning':
      return copy.burning;
    case 'relaying':
      return copy.relaying;
    case 'attesting':
      return copy.attesting;
    case 'minting':
      return copy.minting;
    case 'done':
      return copy.done;
    case 'error':
      return copy.error;
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
  agents,
  tour = true,
}: {
  /// Buyer + seller agent EVM addresses, when the signed-in user has them
  /// provisioned. Both are surfaced in the recipient picker alongside the
  /// user's own identity wallet and a Custom option.
  agents?: { buyer?: string; seller?: string };
  /// Off when embedded in /profile so the Profile tour owns that page and the
  /// bridge tour doesn't fire there too. On for the standalone bridge surface.
  tour?: boolean;
}) {
  const bc = useTranslations().bridgeCard;
  const { isConnected, address: web3Address } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const auth = useAuth();
  const isCircleUser = auth.method === 'circle';
  const identityAddress = (auth.address as `0x${string}` | undefined) ?? undefined;
  const buyerAgent = agents?.buyer ? (agents.buyer as `0x${string}`) : undefined;
  const sellerAgent = agents?.seller ? (agents.seller as `0x${string}`) : undefined;
  const {
    bridges,
    start,
    startCircle,
    startCircleAppKit,
    retry,
    recheck,
    dismiss,
    clearCompleted,
    isActive,
  } = useBridges();
  // This card only handles bridging IN. Out-records render in BridgeOutCard.
  const inBridges = bridges.filter((b) => b.direction !== 'out');
  /// Default to the first chain in SOURCE_CHAINS (Ethereum Sepolia) rather
  /// than Base. The picker is alphabetical-ish but Ethereum-first reads as
  /// the canonical entry point; Base felt arbitrary and was confusing a
  /// new user who expected the first tile to be selected.
  const [sourceKey, setSourceKey] = useState<AnySourceChainKey>('sepolia');
  const [amount, setAmount] = useState<number | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /// Bridge activity used to render as an always-on list under the form,
  /// which pushed the card height as in-flight bridges accumulated. Behind
  /// a button + portal modal now: the form stays clean, and the same
  /// retry/recheck/dismiss controls live inside the modal.
  const [historyOpen, setHistoryOpen] = useState(false);
  /// Source-chain dropdown — previously a 6-tile grid that took too much
  /// vertical space and felt cluttered next to the slim BRIDGE FROM ARC
  /// destination dropdown. Mirrors that pattern: a single button shows the
  /// selected chain, click reveals an absolute list of all options.
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);

  /// Recipient selector: identity wallet, either agent, or a custom paste.
  /// Bridges used to mint straight to the buyer agent, which forced anyone
  /// who wanted USDC on their own wallet (or the seller agent) to send a
  /// follow-up transfer. The picker lets the user choose up front, with a
  /// Custom paste guarded by an Arc Testnet bytecode check so a contract
  /// address doesn't get a silent burn.
  type RecipientKind = 'identity' | 'buyer' | 'seller' | 'custom';
  const defaultKind: RecipientKind = buyerAgent ? 'buyer' : 'identity';
  const [recipientKind, setRecipientKind] = useState<RecipientKind>(defaultKind);
  const [customAddress, setCustomAddress] = useState('');
  /// If the user lands on the page before the agents resolve, snap into the
  /// buyer agent selection once it does — matches the prior default while
  /// keeping the picker honest if the user has already chosen otherwise.
  useEffect(() => {
    if (recipientKind === 'identity' && buyerAgent && !customAddress) {
      setRecipientKind('buyer');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerAgent]);

  /// The selected recipient address, resolved per kind. For Custom we feed
  /// the raw input through viem's checksum to keep the on-chain payload
  /// canonical even when a user pastes lowercase.
  const customCandidate = useMemo(() => {
    const trimmed = customAddress.trim();
    return isAddress(trimmed) ? (trimmed as `0x${string}`) : null;
  }, [customAddress]);

  /// EOA-vs-contract check on the chosen recipient. Identity + known agents
  /// short-circuit the RPC read by being passed in as trusted; Custom hits
  /// Arc Testnet's `eth_getCode` after a debounce.
  const trustedAddresses = useMemo(
    () => [identityAddress, buyerAgent, sellerAgent],
    [identityAddress, buyerAgent, sellerAgent],
  );
  const customKind = useAddressKind(customAddress, {
    enabled: recipientKind === 'custom',
    trustedAddresses,
  });

  const mintRecipient: `0x${string}` | undefined =
    recipientKind === 'identity'
      ? identityAddress
      : recipientKind === 'buyer'
        ? buyerAgent
        : recipientKind === 'seller'
          ? sellerAgent
          : (customCandidate ?? undefined);

  /// Custom must resolve to an EOA before bridging proceeds. Trusted wallets
  /// resolve immediately; for fresh paste the verify hook flips to `eoa`
  /// within ~350ms, or stays `checking` while waiting on the RPC.
  const recipientReady =
    recipientKind === 'custom'
      ? customKind.kind === 'eoa' && !!customCandidate
      : !!mintRecipient;

  const sourceIsAppKitOnly = isAppKitOnlyChainKey(sourceKey);

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
    // bridgeWalletStatus only supports the EVM CCTP chains right now (the
    // backend reads an ERC-20 balanceOf). Solana Devnet uses a separate
    // SPL token + Solana RPC, so its balance read isn't wired yet — show
    // the address-only banner without live balances for that source.
    if (isAppKitOnlyChainKey(sourceKey)) {
      setCircleWallet(null);
      return;
    }
    const cctpKey = sourceKey;
    let cancelled = false;
    setCircleWallet(null);
    const load = () => {
      api
        .bridgeWalletStatus(auth.address as string, cctpKey)
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

  // Resolve EVM source config when we're on a CCTP chain; null when the
  // selected source is App-Kit-only (Solana Devnet). The wagmi balance hook
  // below is conditional on the EVM source so the call is still made
  // unconditionally (rules of hooks) but disabled when there's no EVM
  // address to read.
  const evmSource: SourceChainConfig | null = sourceIsAppKitOnly
    ? null
    : SOURCE_CHAINS[sourceKey];
  const appKitSource: AppKitSourceConfig | null = sourceIsAppKitOnly
    ? APP_KIT_SOURCES[sourceKey]
    : null;

  // Source-chain USDC balance shown on the amount field. Circle users on an
  // EVM source get the polled bridge-wallet balance; web3 users get a
  // cross-chain read of their own wallet on the selected EVM source. Solana
  // (App-Kit-only) currently has no balance read on the frontend.
  const web3SourceBal = useBalance({
    address: web3Address,
    token: evmSource?.usdc,
    chainId: evmSource?.chainId,
    query: { enabled: !!evmSource && !isCircleUser && isConnected && !!web3Address },
  });
  const sourceBalance: string | null = sourceIsAppKitOnly
    ? null
    : isCircleUser
      ? circleWallet?.usdcBalance ?? null
      : web3SourceBal.data
        ? formatUnits(web3SourceBal.data.value, web3SourceBal.data.decimals)
        : null;
  // The wagmi wallet may be on Arc (the user just funded an agent there) or on
  // any other chain. The bridge flow will switch it automatically, but the CTA
  // label tells the user that's about to happen so the wallet pop-up isn't a
  // surprise. App-Kit-only sources (Solana) have no EVM chainId; web3 users
  // can't bridge from them at all so we don't surface a "wrong chain" prompt.
  const onWrongChain =
    !!evmSource && isConnected && walletChainId !== evmSource.chainId;

  // Web3 users have no Solana signer in this app, so App-Kit-only sources are
  // Circle-only. Display label changes accordingly.
  const web3CannotSign = sourceIsAppKitOnly && !isCircleUser;
  const sourceShortName = evmSource?.shortName ?? appKitSource?.shortName ?? '';

  // Split the button gate from "submit burn".
  //   - canSwitch: web3 user on wrong EVM chain just needs an active wallet
  //     to trigger the chain switch. Amount + recipient don't matter.
  //   - canBurn:   web3 user on the correct EVM chain, with amount + recipient.
  //   - canBridgeCircle: Circle user, amount + recipient (backend signs).
  // Solana picked by a web3 user disables everything except a "switch to
  // Circle" hint surfaced inside the button label.
  const canSwitch = !!evmSource && isConnected && onWrongChain && !isSwitching;
  const canBurn =
    !!evmSource &&
    isConnected &&
    !onWrongChain &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!mintRecipient &&
    recipientReady &&
    !isSwitching;
  const canBridgeCircle =
    isCircleUser &&
    !!auth.address &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!mintRecipient &&
    recipientReady;
  const canSubmit =
    !web3CannotSign && (canBridgeCircle || canSwitch || canBurn);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isCircleUser && auth.address) {
      if (!canBridgeCircle) return;
      // Solana (and any future App-Kit-only source) routes through the
      // unified bridge endpoint; EVM Circle bridges keep the hand-rolled
      // pipeline for now. SSE drives both rows identically downstream.
      if (sourceIsAppKitOnly) {
        startCircleAppKit({
          sourceChainKey: sourceKey,
          amountUsdc: amount as number,
          mintRecipient: mintRecipient as `0x${string}`,
          userAddress: auth.address,
        });
        return;
      }
      startCircle({
        sourceChainKey: sourceKey,
        amountUsdc: amount as number,
        mintRecipient: mintRecipient as `0x${string}`,
        userAddress: auth.address,
      });
      return;
    }
    if (web3CannotSign) {
      // Defensive — the submit button is disabled, but a stray Enter shouldn't
      // fire a no-op flow.
      return;
    }
    if (onWrongChain && evmSource) {
      if (!canSwitch) return;
      try {
        await switchChainAsync({ chainId: evmSource.chainId });
      } catch {
        // User declined the wallet prompt. Stay on the same button.
      }
      return;
    }
    if (!canBurn || !mintRecipient) return;
    start({
      sourceChainKey: sourceKey as CctpChainKey,
      amountUsdc: amount as number,
      mintRecipient,
    });
  }

  /// The signed-in user always has at least an identity address, so the
  /// older "buyer agent not configured" full-card fallback no longer fits.
  /// If something genuinely upstream is broken (no identity), guard early
  /// rather than render the picker against an empty option set.
  if (!identityAddress && !buyerAgent && !sellerAgent) {
    return (
      <div style={CARD_STYLE} className="p-6 h-full flex flex-col">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {bc.eyebrow.bridge}
        </span>
        <p className="mt-3 text-[14px] text-[var(--lp-text-sub)]">
          {bc.buyerAgentNotConfigured}
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
            {bc.eyebrow.topUpAgent}
          </span>
          <h2 className="mt-2 font-sans text-[22px] font-extrabold uppercase tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
            {bc.title}
          </h2>
          <p className="mt-2 inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            <span>{bc.cctpV2}</span>
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
              background: 'rgba(175, 201, 91,0.10)',
              color: 'var(--lp-dark)',
              border: '1px solid rgba(175, 201, 91,0.35)',
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
            {bc.inFlightTemplate.replace('{n}', String(activeCount))}
          </span>
        )}
      </div>

      <div className="px-6 pb-6">
        {isCircleUser && !sourceIsAppKitOnly && (
          <CircleSourceFundBanner
            sourceChainKey={sourceKey as CctpChainKey}
            wallet={circleWallet}
            copy={bc.circleFund}
          />
        )}
        {isCircleUser && sourceIsAppKitOnly && appKitSource && (
          <AppKitFundBanner source={appKitSource} copy={bc.appKitFund} />
        )}
        {!isCircleUser && isConnected && evmSource && (
          <Web3FundHint source={evmSource} copy={bc.web3Fund} />
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* SOURCE CHAIN DROPDOWN. Single button + absolute list, mirroring
              BridgeOutCard's destination picker. Combines CCTP EVM chains
              and AppKit chains in one merged list; Solana stays visible to
              web3 users but disabled with a "needs Circle" tag because we
              have no wagmi connector for it. */}
          <SourceChainDropdown
            value={sourceKey}
            onChange={setSourceKey}
            open={sourcePickerOpen}
            setOpen={setSourcePickerOpen}
            isCircleUser={isCircleUser}
            eyebrow={bc.eyebrow.sourceChain}
            copy={bc.sourceChain}
          />

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
                {bc.eyebrow.amount}
              </span>
              {sourceBalance != null && Number(sourceBalance) > 0 ? (
                <button
                  type="button"
                  onClick={() => setAmount(Number(sourceBalance))}
                  className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                  title={bc.amount.maxTitle}
                >
                  {bc.amount.balanceMaxTemplate.replace('{amount}', formatUsdc(sourceBalance, { withSuffix: false }))}
                </button>
              ) : (
                <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                  USDC
                </span>
              )}
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
                box-shadow: 0 0 0 3px rgba(175, 201, 91, 0.25);
              }
            `}</style>
          </div>

          {/* MINTS TO — picker + optional Custom paste */}
          <RecipientPicker
            kind={recipientKind}
            setKind={setRecipientKind}
            identityAddress={identityAddress}
            buyerAgent={buyerAgent}
            sellerAgent={sellerAgent}
            customAddress={customAddress}
            setCustomAddress={setCustomAddress}
            customKind={customKind.kind}
            resolved={mintRecipient}
            copy={bc.recipient}
            mintsToEyebrow={bc.eyebrow.mintsTo}
            arcLabel={bc.arcTestnet}
          />

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
                  {web3CannotSign
                    ? bc.submit.solanaNeedsCircle
                    : isCircleUser
                      ? bc.submit.bridgeFromTemplate.replace('{chain}', sourceShortName)
                      : isSwitching
                        ? bc.submit.switchingToTemplate.replace('{chain}', sourceShortName)
                        : onWrongChain
                          ? bc.submit.switchToTemplate.replace('{chain}', sourceShortName)
                          : bc.submit.bridgeFromTemplate.replace('{chain}', sourceShortName)}
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
              bc.submit.connectWallet
            )}
          </button>
        </form>

        {inBridges.length > 0 && (
          <div className="mt-7 pt-5 border-t border-[var(--lp-border-light)] flex items-center justify-between gap-3">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
              {bc.eyebrow.activity}
            </span>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] hover:opacity-80 transition-opacity px-3 py-1.5 border border-black/15 inline-flex items-center gap-2"
              style={{
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              <span>
                {inBridges.length}{' '}
                {inBridges.length === 1
                  ? bc.activity.bridgeSingular
                  : bc.activity.bridgePlural}
              </span>
              <span aria-hidden>›</span>
            </button>
          </div>
        )}
      </div>
      <BridgeHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        bridges={inBridges}
        expandedId={expandedId}
        onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
        onRetry={retry}
        onRecheck={recheck}
        onDismiss={dismiss}
        onClearCompleted={clearCompleted}
        isActive={isActive}
        copy={bc}
      />
    </div>
  );
}

export function BridgeRow({
  bridge,
  expanded,
  onToggle,
  onRetry,
  onRecheck,
  onDismiss,
  copy,
}: {
  bridge: BridgeRecord;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onRecheck: () => void;
  onDismiss: () => void;
  copy: Messages['bridgeCard']['row'];
}) {
  // Bridge records can be EVM (SOURCE_CHAINS) or App-Kit-only (Solana, in
  // APP_KIT_SOURCES). Use the uniform meta lookup so this row renders for
  // either source without per-chain branching.
  const meta = bridgeChainMeta(bridge.sourceChainKey);
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
        className="absolute start-0 top-0 bottom-0 w-[3px]"
        style={{ background: railColor }}
      />
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-start p-3 ps-4 flex items-center gap-3"
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
            <PhaseChip tone={tone} label={phaseLabel(bridge.phase, copy.phase, meta.shortName)} />
            <span className="text-[10px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-none tabular-nums">
              {elapsed(bridge.startedAt, copy.elapsed)}
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
                {copy.stale}
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
        <SegmentedProgress idx={idx} tone={tone} copy={copy.progress} />
      </div>

      {expanded && (
        <div className="border-t border-[var(--lp-border-light)] px-3 py-3 space-y-3">
          <BridgeSteps bridge={bridge} copy={copy.steps} />

          {bridge.error && <ErrorBanner message={bridge.error} copy={copy.error} />}

          {(bridge.burnTxHash || bridge.mintTxHash) && (
            <div className="space-y-1.5">
              {bridge.burnTxHash && (
                <a
                  href={meta.explorerTx(bridge.burnTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline justify-between gap-3 text-[11px] hover:text-[var(--lp-dark)] text-[var(--lp-text-sub)] py-0.5 transition-colors"
                >
                  <span className="mono uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    {copy.burnLabelTemplate.replace('{chain}', meta.shortName.toUpperCase())}
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
                    {copy.mintLabel}
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
              {copy.stuckNote}
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
                {copy.recheckOnChain}
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
                {copy.retryFromStart}
              </button>
            )}
            {(bridge.phase === 'done' || bridge.phase === 'error' || isStuck) && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-1.5 mono text-[11px] uppercase tracking-[0.08em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-[var(--lp-card)] transition-colors rounded"
              >
                {copy.dismiss}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function SegmentedProgress({
  idx,
  tone,
  copy,
}: {
  idx: number;
  tone: 'live' | 'positive' | 'critical';
  copy: Messages['bridgeCard']['row']['progress'];
}) {
  const segments = [copy.approve, copy.burn, copy.attest, copy.mint];
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
                className="absolute inset-y-0 start-0 w-1/2"
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

function BridgeSteps({
  bridge,
  copy,
}: {
  bridge: BridgeRecord;
  copy: Messages['bridgeCard']['row']['steps'];
}) {
  const meta = bridgeChainMeta(bridge.sourceChainKey);
  const idx = stepIndexFor(bridge.phase);
  const errored = bridge.phase === 'error';
  const steps: Array<{ key: BridgePhase; label: string; hint?: string }> = [
    { key: 'approving', label: copy.approveTemplate.replace('{chain}', meta.shortName) },
    { key: 'burning', label: copy.burnTemplate.replace('{chain}', meta.shortName) },
    { key: 'attesting', label: copy.circleAttestation, hint: copy.attestationHint },
    { key: 'minting', label: copy.mintArc },
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
            ? 'rgba(175, 201, 91,0.12)'
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
                className="absolute start-[13px] top-[26px] w-px"
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
                      background: 'rgba(175, 201, 91,0.18)',
                      color: 'var(--lp-dark)',
                      border: '1px solid rgba(175, 201, 91,0.35)',
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

function ErrorBanner({
  message,
  copy,
}: {
  message: string;
  copy: Messages['bridgeCard']['row']['error'];
}) {
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
          {copy.errorBadge}
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
        : 'rgba(175, 201, 91,0.14)';
  const border =
    tone === 'positive'
      ? 'rgba(10,117,83,0.35)'
      : tone === 'critical'
        ? 'rgba(176,61,58,0.35)'
        : 'rgba(175, 201, 91,0.45)';
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
  copy,
}: {
  sourceChainKey: SourceChainConfig['key'];
  wallet: { address: string; usdcBalance: string | null; gasBalance: string | null } | null;
  copy: Messages['bridgeCard']['circleFund'];
}) {
  const [copied, setCopied] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
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

  // In-app USDC top-up straight to this source-chain Circle wallet, so the user
  // never leaves the page. USDC only: Circle users don't need native gas here
  // (Gas Station sponsors the burn) and Circle's faucet declines native to these
  // wallets. Rate limits surface as a clear line, not a silent no-op.
  const CIRCLE_FAUCET = 'https://faucet.circle.com/';
  async function claimUsdc() {
    if (!address) return;
    setClaiming(true);
    setNote(null);
    try {
      await api.fundSource(address, sourceChainKey);
      setNote({ kind: 'ok', text: copy.testUsdcRequested });
    } catch (err) {
      const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : null;
      setNote({ kind: 'err', text: detail ?? (err as Error).message });
    } finally {
      setClaiming(false);
    }
  }

  // Funded state drives the banner accent + status line. usdcBalance null means
  // the balance read hasn't returned yet (or failed) — stay neutral.
  const usdc = wallet?.usdcBalance != null ? Number(wallet.usdcBalance) : null;
  const funded = usdc != null && usdc > 0;
  const empty = usdc != null && usdc <= 0;
  const accent = empty ? TONE_HEX.warning : 'var(--lp-accent)';

  const statusLine = !wallet
    ? copy.statusChecking
    : empty
      ? copy.statusEmpty
      : funded
        ? copy.statusFunded
        : copy.statusSendUsdc;

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
        className="absolute start-0 top-0 bottom-0 w-[3px]"
        style={{ background: accent }}
      />
      <div className="px-4 py-3 ps-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 px-1.5 py-[3px] mono text-[9px] font-bold uppercase tracking-[0.16em] leading-none"
            style={{
              background: funded ? 'rgba(10,117,83,0.12)' : empty ? 'rgba(178,84,37,0.12)' : 'rgba(175, 201, 91, 0.18)',
              color: funded ? TONE_HEX.positive : empty ? TONE_HEX.warning : 'var(--lp-band-dark)',
              border: `1px solid ${funded ? 'rgba(10,117,83,0.35)' : empty ? 'rgba(178,84,37,0.35)' : 'var(--lp-accent)'}`,
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              borderBottomLeftRadius: 4,
              borderBottomRightRadius: 2,
            }}
          >
            <span aria-hidden className="inline-block w-[5px] h-[5px]" style={{ background: accent }} />
            {funded ? copy.badgeFunded : copy.badgeFundToBridge}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {statusLine}
          </span>
        </div>

        {/* LIVE BALANCE READOUT */}
        <div className="mt-3 flex items-baseline gap-4">
          <div>
            <p className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              {copy.balanceHere}
            </p>
            <p className="mt-0.5 font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]">
              {wallet?.usdcBalance == null ? '—' : formatUsdc(wallet.usdcBalance, { withSuffix: false })}
              <span className="ms-1 mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                USDC
              </span>
            </p>
          </div>
          <div>
            <p className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              {copy.gas}
            </p>
            <p
              className="mt-0.5 mono text-[11px] uppercase tracking-[0.12em] leading-none"
              style={{ color: TONE_HEX.positive }}
            >
              {copy.sponsored}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-[var(--lp-text-sub)]">
          {copy.gasSponsoredNote}
        </p>

        {/* ADDRESS + ACTIONS */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              {copy.addressLabel}
            </p>
            <p className="mt-0.5 mono text-[12px] tabular-nums text-[var(--lp-dark)] truncate">
              {address ?? copy.provisioning}
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
              {copied ? copy.copied : copy.copy}
            </button>
            <button
              type="button"
              onClick={claimUsdc}
              disabled={!address || claiming}
              className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1 px-2 py-1 disabled:opacity-50"
              style={{
                background: 'var(--lp-accent)',
                color: 'var(--lp-band-dark)',
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              {claiming ? copy.requesting : copy.getUsdc}
            </button>
          </div>
        </div>
        {note && (
          <p
            className="mt-2 text-[11px] leading-snug"
            style={{ color: note.kind === 'err' ? TONE_HEX.warning : 'var(--lp-text-sub)' }}
          >
            {note.text}
          </p>
        )}
        <div className="mt-1.5">
          <a
            href={CIRCLE_FAUCET}
            target="_blank"
            rel="noreferrer"
            className="mono text-[9px] uppercase tracking-[0.16em] font-bold inline-flex items-center gap-1 text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            {copy.circleFaucet}
            <ExternalIcon />
          </a>
        </div>
      </div>
    </div>
  );
}

/// Solana Devnet (and any future App-Kit-only source) needs a different
/// funding banner than the EVM Circle path. The backend lazy-provisions a
/// per-user Solana DCW (EOA on SOL-DEVNET) on first read; we fetch its
/// address here and display it with a Copy button so users know exactly
/// where to send USDC. Live balance polling isn't wired yet for Solana
/// (the backend ERC-20 balance read doesn't apply to SPL tokens), so the
/// banner stays address-only — the faucet links are the user's primary
/// path because auto-drip is unreliable on devnet.
function AppKitFundBanner({
  source,
  copy,
}: {
  source: AppKitSourceConfig;
  copy: Messages['bridgeCard']['appKitFund'];
}) {
  const auth = useAuth();
  const [address, setAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /// Solana provisioning was sitting at "provisioning…" forever when the
  /// backend call rejected (Circle rate-limits, transient API blips, or
  /// the wallet creation failing for a permissions reason). The old
  /// silent-swallow catch gave the user no way to know what happened and
  /// no way to retry. Surface the error and let the user re-fire.
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!auth.address) return;
    let cancelled = false;
    setAddress(null);
    setError(null);
    api
      .bridgeCircleSourceAddress(auth.address as string, source.key)
      .then((r) => {
        if (!cancelled) setAddress(r.address);
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Could not provision wallet';
        setError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.address, source.key, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard can fail in unfocused tabs */
    }
  }

  return (
    <div
      className="relative mb-4 overflow-hidden px-4 py-3 ps-5"
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
        className="absolute start-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'var(--lp-accent)' }}
      />
      <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        {copy.eyebrowTemplate.replace('{chain}', source.shortName.toUpperCase())}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--lp-text-sub)]">
        {copy.descriptionTemplate
          .replace('{name}', source.name)
          .replace('{shortName}', source.shortName)
          .replace('{nativeSymbol}', source.nativeSymbol)}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {copy.addressLabelTemplate.replace('{chain}', source.shortName)}
          </p>
          <p className="mt-0.5 mono text-[12px] tabular-nums text-[var(--lp-dark)] truncate">
            {address ?? (error ? 'failed' : copy.provisioning)}
          </p>
          {error && !address && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <p className="text-[11px] leading-snug text-[#b03d3a] flex-1 min-w-0">
                {error}
              </p>
              <button
                type="button"
                onClick={retry}
                className="mono text-[10px] uppercase tracking-[0.14em] px-2.5 py-1 transition-colors"
                style={{
                  background: 'var(--lp-card)',
                  color: 'var(--lp-dark)',
                  border: '1px solid var(--lp-border-light)',
                  borderRadius: 6,
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={copyAddress}
          disabled={!address}
          className="mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] hover:opacity-80 transition-opacity disabled:opacity-50 px-2 py-1 border border-black/15 shrink-0"
          style={{
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 2,
            color: copied ? '#0a7553' : undefined,
          }}
        >
          {copied ? copy.copied : copy.copy}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {source.faucet && (
          <FaucetLink href={source.faucet}>
            {copy.claimGasTemplate.replace('{native}', source.nativeSymbol)}
          </FaucetLink>
        )}
        <FaucetLink href={USDC_FAUCET}>{copy.getTestUsdc}</FaucetLink>
      </div>
    </div>
  );
}

/// Web3 users sign their own source-chain burn, so they pay gas there. Gas
/// Station only sponsors Circle DCWs, so a connected wallet claims its own native
/// gas from a public faucet (the prominent link). USDC is the one part we can
/// pool in-app: Circle's faucet drips it straight to the connected wallet.
function Web3FundHint({
  source,
  copy,
}: {
  source: SourceChainConfig;
  copy: Messages['bridgeCard']['web3Fund'];
}) {
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
        text: copy.testUsdcSentTemplate.replace('{name}', source.name),
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
      className="relative mb-4 overflow-hidden px-4 py-3 ps-5"
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
        className="absolute start-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'var(--lp-accent)' }}
      />
      <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        {copy.eyebrowTemplate.replace('{chain}', source.shortName.toUpperCase())}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-[var(--lp-text-sub)]">
        {copy.descriptionTemplate
          .replace('{name}', source.name)
          .replace('{nativeSymbol}', source.nativeSymbol)}
      </p>
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <FaucetLink href={GAS_FAUCETS[source.key]}>
          {copy.claimGasTemplate.replace('{native}', source.nativeSymbol)}
        </FaucetLink>
        <button
          type="button"
          onClick={pullUsdc}
          disabled={busy || !auth.address}
          className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1.5 px-2.5 py-1 border transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
          style={{
            borderColor: 'var(--lp-accent)',
            color: 'var(--lp-band-dark)',
            background: 'rgba(175, 201, 91, 0.18)',
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 2,
          }}
        >
          {busy ? copy.requesting : copy.getTestUsdc}
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

/// Portal-based history overlay. The bridge card form stays calm; this modal
/// is where every in-flight, settled, and failed bridge lives. Same
/// retry/recheck/dismiss controls as the old inline list — pending rows
/// keep their actions but cannot be dismissed (Dismiss is gated on
/// !isActive inside BridgeRow already, so the modal just renders the rows
/// and the existing UI law plays out).
function BridgeHistoryModal({
  open,
  onClose,
  bridges,
  expandedId,
  onToggle,
  onRetry,
  onRecheck,
  onDismiss,
  onClearCompleted,
  isActive,
  copy,
}: {
  open: boolean;
  onClose: () => void;
  bridges: BridgeRecord[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onRetry: (id: string) => void;
  onRecheck: (id: string) => void;
  onDismiss: (id: string) => void;
  onClearCompleted: () => void;
  isActive: (phase: BridgePhase) => boolean;
  copy: Messages['bridgeCard'];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    /// Lock body scroll while the modal is open so users on long bridge
    /// histories don't accidentally scroll the page underneath.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;
  const hasCompleted = bridges.some((b) => !isActive(b.phase));

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={copy.eyebrow.activity}
    >
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-[640px] max-h-[88vh] overflow-hidden flex flex-col"
        style={{
          background: 'var(--lp-card)',
          color: 'var(--lp-dark)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
          border: '1px solid var(--lp-border-light)',
        }}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--lp-border-light)]">
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
            {copy.eyebrow.activity}
          </span>
          <div className="flex items-center gap-3">
            {hasCompleted && (
              <button
                type="button"
                onClick={onClearCompleted}
                className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
                title={copy.activity.clearHistoryTitle}
              >
                {copy.activity.clearHistory}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-[18px] leading-none text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors px-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <ul className="space-y-2">
            {bridges.map((b) => (
              <BridgeRow
                key={b.id}
                bridge={b}
                expanded={expandedId === b.id}
                onToggle={() => onToggle(b.id)}
                onRetry={() => onRetry(b.id)}
                onRecheck={() => onRecheck(b.id)}
                onDismiss={() => onDismiss(b.id)}
                copy={copy.row}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/// Recipient picker for the bridge form. Surfaces the three known-good
/// wallets (identity, buyer agent, seller agent) as one-click choices and a
/// Custom paste box guarded by an on-chain bytecode check. The picker keeps
/// the form clean — only the Custom branch renders the input + warning band.
function RecipientPicker({
  kind,
  setKind,
  identityAddress,
  buyerAgent,
  sellerAgent,
  customAddress,
  setCustomAddress,
  customKind,
  resolved,
  copy,
  mintsToEyebrow,
  arcLabel,
}: {
  kind: 'identity' | 'buyer' | 'seller' | 'custom';
  setKind: (k: 'identity' | 'buyer' | 'seller' | 'custom') => void;
  identityAddress?: `0x${string}`;
  buyerAgent?: `0x${string}`;
  sellerAgent?: `0x${string}`;
  customAddress: string;
  setCustomAddress: (v: string) => void;
  customKind: 'idle' | 'invalid' | 'checking' | 'eoa' | 'contract';
  resolved?: `0x${string}`;
  copy: Messages['bridgeCard']['recipient'];
  mintsToEyebrow: string;
  arcLabel: string;
}) {
  type Choice = {
    key: 'identity' | 'buyer' | 'seller' | 'custom';
    label: string;
    address?: `0x${string}`;
    isCustom?: boolean;
  };
  const choices: Choice[] = [
    { key: 'identity', label: copy.identityLabel, address: identityAddress },
    { key: 'buyer', label: copy.buyerLabel, address: buyerAgent },
    { key: 'seller', label: copy.sellerLabel, address: sellerAgent },
    { key: 'custom', label: copy.customLabel, isCustom: true },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
          {copy.eyebrowChoose}
        </span>
        <div className="flex items-center gap-1.5 text-[10px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)] shrink-0">
          <ChainMark which="arc" size={14} />
          <span>{arcLabel}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((c) => {
          const active = kind === c.key;
          const disabled = !c.isCustom && !c.address;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => !disabled && setKind(c.key)}
              disabled={disabled}
              aria-pressed={active}
              className="relative overflow-hidden text-start px-3 py-2.5 transition-colors"
              style={{
                background: active ? 'rgba(175, 201, 91, 0.12)' : 'var(--lp-card)',
                border: active
                  ? '1px solid var(--lp-accent)'
                  : '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 2,
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <p className="text-[12px] font-semibold leading-tight text-[var(--lp-dark)]">
                {c.label}
              </p>
              <p className="mt-0.5 mono text-[10px] tabular-nums text-[var(--lp-text-muted)] truncate">
                {c.isCustom
                  ? '0x...'
                  : c.address
                    ? shortAddress(c.address)
                    : copy.notConfigured}
              </p>
            </button>
          );
        })}
      </div>

      {kind === 'custom' ? (
        <div className="space-y-2">
          <input
            type="text"
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            placeholder={copy.customPlaceholder}
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-[var(--lp-light)] px-4 py-3 text-[13px] mono tabular-nums focus:outline-none text-[var(--lp-dark)] placeholder:text-[var(--lp-text-muted)]"
            style={{
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 2,
            }}
          />
          <VerifyBanner kind={customKind} copy={copy} />
          <p className="text-[11.5px] leading-snug text-[var(--lp-text-sub)]">
            {copy.customWarning}
          </p>
        </div>
      ) : (
        resolved && (
          <div
            className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
            style={{
              background: 'var(--lp-light)',
              border: '1px dashed rgba(0,0,0,0.18)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <WalletAvatar address={resolved} size={24} />
              <div className="flex-1 min-w-0">
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                  {mintsToEyebrow}
                </span>
                <p className="mt-0.5 text-[13px] mono tabular-nums truncate text-[var(--lp-dark)]">
                  {shortAddress(resolved)}
                </p>
              </div>
            </div>
            {/* Verified pill stacks below the address on mobile so a long
                translation ("Wallet address verified" / "تم التحقق من عنوان
                المحفظة") doesn't squeeze the address to "0..." (was the
                dominant mobile mint-to layout bug). On sm+ it sits inline
                on the right edge as before. */}
            <span
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-2 py-1 mono text-[10px] uppercase tracking-[0.14em] whitespace-nowrap"
              style={{
                background: 'rgba(10, 117, 83, 0.10)',
                color: '#0a7553',
                border: '1px solid rgba(10, 117, 83, 0.30)',
                borderRadius: 4,
              }}
            >
              <span
                aria-hidden
                className="inline-block w-[5px] h-[5px]"
                style={{ background: '#0a7553', borderRadius: 1 }}
              />
              {copy.verify.verifiedEoa}
            </span>
          </div>
        )
      )}
    </div>
  );
}

function VerifyBanner({
  kind,
  copy,
}: {
  kind: 'idle' | 'invalid' | 'checking' | 'eoa' | 'contract';
  copy: Messages['bridgeCard']['recipient'];
}) {
  if (kind === 'idle') return null;
  const tone =
    kind === 'eoa'
      ? { bg: 'rgba(10, 117, 83, 0.10)', text: '#0a7553', border: 'rgba(10, 117, 83, 0.30)' }
      : kind === 'contract' || kind === 'invalid'
        ? { bg: 'rgba(176, 61, 58, 0.10)', text: '#b03d3a', border: 'rgba(176, 61, 58, 0.30)' }
        : { bg: 'var(--lp-card)', text: 'var(--lp-text-sub)', border: 'var(--lp-border-light)' };
  const label =
    kind === 'checking'
      ? copy.verify.checking
      : kind === 'eoa'
        ? copy.verify.verifiedEoa
        : kind === 'contract'
          ? copy.verify.contractDanger
          : copy.verify.invalid;
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-2 text-[11.5px] mono"
      style={{
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 2,
      }}
    >
      <span
        aria-hidden
        className={
          kind === 'checking'
            ? 'inline-block w-[6px] h-[6px] rounded-full animate-pulse motion-reduce:animate-none'
            : 'inline-block w-[6px] h-[6px]'
        }
        style={{ background: tone.text, borderRadius: kind === 'checking' ? 999 : 1 }}
      />
      {label}
    </div>
  );
}

/// Source-chain dropdown. One merged list of CCTP EVM chains + AppKit
/// chains (Solana). Behaves identically for web3 and Circle users — the
/// only difference is Solana's row is disabled with a "needs Circle" tag
/// for web3 since the app has no Solana wagmi connector. Replaces the
/// previous 6-tile grid which was visually heavy and didn't match the
/// slim destination dropdown on the FROM ARC card.
function SourceChainDropdown({
  value,
  onChange,
  open,
  setOpen,
  isCircleUser,
  eyebrow,
  copy,
}: {
  value: AnySourceChainKey;
  onChange: (next: AnySourceChainKey) => void;
  open: boolean;
  setOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  isCircleUser: boolean;
  eyebrow: string;
  copy: Messages['bridgeCard']['sourceChain'];
}) {
  type Option = {
    key: AnySourceChainKey;
    name: string;
    meta: string;
    iconKey: string;
    disabled: boolean;
    disabledTag?: string;
    disabledTitle?: string;
  };

  const options: Option[] = useMemo(() => {
    const cctp = (Object.values(SOURCE_CHAINS) as SourceChainConfig[]).map(
      (c): Option => ({
        key: c.key as AnySourceChainKey,
        name: c.name.replace(' Sepolia', ''),
        meta: copy.sepoliaDomainTemplate.replace('{domain}', String(c.domain)),
        iconKey: c.key,
        disabled: false,
      }),
    );
    const appKit = APP_KIT_SOURCE_KEYS.map((k): Option => {
      const c = APP_KIT_SOURCES[k];
      return {
        key: k as AnySourceChainKey,
        name: c.shortName,
        meta: copy.devnetAppKit,
        iconKey: 'solana',
        disabled: !isCircleUser,
        disabledTag: copy.circleOnlyTag,
        disabledTitle: copy.solanaCircleOnlyTitle,
      };
    });
    return [...cctp, ...appKit];
  }, [isCircleUser, copy]);

  const active = options.find((o) => o.key === value) ?? options[0];

  return (
    <div data-guide="bridge-source" className="relative">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
        {eyebrow}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="mt-2.5 w-full flex items-center justify-between gap-3 px-4 py-3 text-start transition-colors"
        style={{
          background: 'var(--lp-card)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 3,
        }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <ChainMark which={active.iconKey} size={26} />
          <span className="min-w-0">
            <span className="block font-sans text-[14px] font-semibold tracking-tight text-[var(--lp-dark)] leading-tight">
              {active.name}
            </span>
            <span
              className="block mt-0.5 mono text-[10px] uppercase tracking-[0.12em]"
              style={{ color: 'var(--lp-text-muted)' }}
            >
              {active.meta}
            </span>
          </span>
        </span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className={`text-[var(--lp-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M3 6l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <>
          {/* Click-outside catcher. Sits behind the panel and dismisses on
              any backdrop click without intercepting actual option clicks
              (which sit on the panel itself, above this layer). */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
            style={{ background: 'transparent' }}
          />
          <ul
            role="listbox"
            className="absolute z-20 start-0 end-0 mt-2 p-1.5 fade-up"
            style={{
              background: 'var(--lp-card)',
              border: '1px solid var(--lp-border-light)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 4,
              boxShadow: '0 18px 50px -18px rgba(0,0,0,0.28)',
            }}
          >
            {options.map((opt) => {
              const isActive = opt.key === value;
              return (
                <li key={opt.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    disabled={opt.disabled}
                    title={opt.disabled ? opt.disabledTitle : undefined}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.key);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[var(--lp-light)] transition-colors text-start disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
                  >
                    <ChainMark which={opt.iconKey} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-sans text-[13px] font-semibold text-[var(--lp-dark)]">
                          {opt.name}
                        </span>
                        {opt.disabled && opt.disabledTag && (
                          <span
                            className="mono text-[8px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full"
                            style={{
                              color: 'var(--lp-text-muted)',
                              background: 'rgba(0,0,0,0.05)',
                            }}
                          >
                            {opt.disabledTag}
                          </span>
                        )}
                      </div>
                      <p
                        className="mono text-[10px] mt-0.5 uppercase tracking-[0.12em]"
                        style={{ color: 'var(--lp-text-muted)' }}
                      >
                        {opt.meta}
                      </p>
                    </div>
                    {isActive && !opt.disabled && (
                      <span
                        aria-hidden
                        className="ms-auto inline-block w-[6px] h-[6px]"
                        style={{ background: 'var(--lp-accent)', borderRadius: 1 }}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
