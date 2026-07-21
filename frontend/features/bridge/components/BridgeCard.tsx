'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useSwitchChain, useBalance } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { formatUnits, isAddress } from 'viem';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAddressKind } from '@/shared/hooks/useAddressKind';
import { api, ApiError } from '@/core/api';
import {
  SOURCE_CHAINS,
  APP_KIT_SOURCES,
  APP_KIT_SOURCE_KEYS,
  GAS_FAUCETS,
  CIRCLE_SOURCE_KEYS,

  SOLANA_MIN_SOL,
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
import { useSolanaWallet } from '../hooks/useSolanaWallet';
import { SolanaConnectCard } from './SolanaConnectCard';
import { BridgeActivityStrip } from './BridgeActivityStrip';
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

/// Per-user "hidden from activity" bridge IDs. Persisted in localStorage so
/// dismissals survive reloads. The dismissals are local-display-only,
/// they DO NOT touch the shared useBridges store, so the bridge history
/// modal (a separate surface) still shows every bridge the user made.
/// The previous implementation called useBridges().dismiss which removed
/// records from the shared store, so clearing activity also cleared the
/// bridge history (the bug the user reported).
export function useHiddenActivityBridgeIds(address: string | null): {
  set: Set<string>;
  hide: (id: string) => void;
  hideMany: (ids: string[]) => void;
} {
  const storageKey = address ? `karwan:bridges:hiddenActivity:${address.toLowerCase()}` : null;
  const [version, setVersion] = useState(0);
  const set = useMemo<Set<string>>(() => {
    if (!storageKey || typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
    } catch {
      return new Set();
    }
    /// version is read so React re-derives the set after hide() bumps it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, version]);

  const write = (next: Set<string>) => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    } catch {
      /* quota, ignore */
    }
    setVersion((v) => v + 1);
  };

  const hide = (id: string) => {
    const next = new Set(set);
    next.add(id);
    write(next);
  };
  const hideMany = (ids: string[]) => {
    const next = new Set(set);
    for (const id of ids) next.add(id);
    write(next);
  };

  return { set, hide, hideMany };
}

function elapsed(ts: number, copy: { secondsTemplate: string; minutesTemplate: string; hoursTemplate: string }): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return copy.secondsTemplate.replace('{n}', String(s));
  const m = Math.floor(s / 60);
  if (m < 60) return copy.minutesTemplate.replace('{n}', String(m));
  /// For bridges over 24 hours old, fold to an absolute date/time stamp.
  /// "90H 36M" was unreadable as identification. Users needed to know
  /// WHEN a bridge happened, not how many hours have ticked since.
  /// Same-day timestamps show time only; older days show date + time
  /// so history rows are uniquely identifiable at a glance.
  const h = Math.floor(m / 60);
  if (h < 24) {
    return copy.hoursTemplate.replace('{h}', String(h)).replace('{m}', String(m % 60));
  }
  const date = new Date(ts);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
  const { isConnected, address: web3Address, connector } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  /// Solana connect-wallet (non-custodial). Slice A surfaces connect + balance;
  /// the burn is wired next. Isolated from wagmi so the two never collide.
  const solana = useSolanaWallet();
  const auth = useAuth();
  const isCircleUser = auth.method === 'circle';
  const identityAddress = (auth.address as `0x${string}` | undefined) ?? undefined;
  const buyerAgent = agents?.buyer ? (agents.buyer as `0x${string}`) : undefined;
  const sellerAgent = agents?.seller ? (agents.seller as `0x${string}`) : undefined;
  const { bridges, startCircle, startCircleAppKit, startAppKitBridge, isActive } = useBridges();
  // This card only handles bridging IN. Out-records render in BridgeOutCard.
  const inBridgesAll = bridges.filter((b) => b.direction !== 'out');
  // True while an add-money bridge is in an early, pre-attestation phase. The
  // record is created the instant the user submits (before the App Kit dynamic
  // import and the wallet popup), so this drives the submit button's loading
  // state through that gap, where the user previously saw no feedback.
  const startingBridge = inBridgesAll.some(
    (b) => b.phase === 'switching' || b.phase === 'approving' || b.phase === 'burning',
  );
  /// IDs the user has dismissed from the ACTIVITY modal. Stored in
  /// localStorage so a dismiss survives reload, but never written to the
  /// shared useBridges store. The bridge history modal (a separate
  /// surface) keeps showing every bridge the user ever made. This is the
  /// fix for "Clear all in activity also cleared bridge history": the
  /// previous code called useBridges().dismiss which removed the record
  /// from the shared store, so both modals lost it.
  const hiddenIds = useHiddenActivityBridgeIds(identityAddress ?? null);
  const inBridges = useMemo(
    () => inBridgesAll.filter((b) => !hiddenIds.set.has(b.id)),
    [inBridgesAll, hiddenIds.set],
  );
  /// Default to the first chain in SOURCE_CHAINS (Ethereum Sepolia) rather
  /// than Base. The picker is alphabetical-ish but Ethereum-first reads as
  /// the canonical entry point; Base felt arbitrary and was confusing a
  /// new user who expected the first tile to be selected.
  const [sourceKey, setSourceKey] = useState<AnySourceChainKey>('sepolia');
  const [amount, setAmount] = useState<number | ''>('');
  /// Source-chain dropdown, previously a 6-tile grid that took too much
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
  /// Default to the user's own Arc wallet so the common "top up my balance"
  /// path needs no decisions. Sending to an agent or a pasted address is a
  /// deliberate choice made through the "Send somewhere else" disclosure.
  const [recipientKind, setRecipientKind] = useState<RecipientKind>('identity');
  const [customAddress, setCustomAddress] = useState('');
  /// The full recipient picker stays collapsed until the user asks to send
  /// somewhere other than their own wallet, so the default form is amount
  /// plus one button.
  const [recipientOpen, setRecipientOpen] = useState(false);
  /// Funding path. Default is connect-wallet: bring USDC from any wallet and
  /// one signature moves it to Arc, no deposit address to provision. Circle
  /// users can opt into the deposit-address fallback, which is the only path
  /// that provisions a per-chain DCW (and the one that used to hang on load).
  const [depositMode, setDepositMode] = useState(false);
  // Circle (email/passkey) users have no browser wallet, so "connect a wallet"
  // is friction we don't need: default them to the no-connect deposit path, where
  // the backend bridges from a provisioned Circle DCW. One-shot once auth
  // resolves; a later manual toggle (use a wallet instead) still wins. Web3 users
  // keep the connect-wallet default.
  const depositModeInit = useRef(false);
  useEffect(() => {
    if (depositModeInit.current || !auth.method) return;
    depositModeInit.current = true;
    if (auth.method === 'circle') setDepositMode(true);
  }, [auth.method]);

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
    gasSponsored: boolean;
  } | null>(null);
  useEffect(() => {
    // Only provision + poll the source-chain DCW when the user has opted into
    // the deposit-address path. This is the fix for the "provisioning…" hang:
    // the default connect-wallet flow never touches bridgeWalletStatus, so a
    // slow Circle wallet-creation call can't stall a user who never asked for
    // a deposit address.
    // Circle users default to the deposit path, so provision + poll the source
    // DCW for them whenever they're on an EVM source (not gated on the manual
    // depositMode toggle any more). Web3 users never hit this branch.
    if (!isCircleUser || !auth.address) {
      setCircleWallet(null);
      return;
    }
    // bridgeWalletStatus only supports the EVM CCTP chains right now (the
    // backend reads an ERC-20 balanceOf). Solana Devnet uses a separate
    // SPL token + Solana RPC, so its balance read isn't wired yet. Show
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
              // Absent on an older backend: assume NOT sponsored rather than
              // promise something that may not be true.
              gasSponsored: r.gasSponsored === true,
            });
        })
        .catch(() => {
          /* keep the prior value; the banner shows "checking" until first hit */
        });
    };
    load();
    // Poll every 5s so a fresh faucet claim to the deposit wallet reflects
    // without a page refresh.
    const id = setInterval(load, 5_000);
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

  // Funding path.
  //   - appKitPath: Solana (App-Kit-only). No wagmi Solana signer exists, so
  //     the backend always signs it from a Circle DCW the user funds by
  //     sending USDC to a deposit address. Available to every account type.
  //   - walletPath (default for EVM): any connected wallet signs the burn and
  //     the USDC lands on Arc in one signature.
  //   - depositPath: Circle-only EVM fallback that burns from a provisioned DCW.
  const appKitPath = sourceIsAppKitOnly;
  const walletConnected = isConnected && !!web3Address;
  const walletPath = !appKitPath && walletConnected && !depositMode;
  // Solana for an EMAIL account: the backend signs the burn from their Solana
  // deposit wallet through App Kit's Circle Wallets adapter, so they fund an
  // address and never connect anything. Phantom is now web3-only.
  const solanaDepositPath = appKitPath && isCircleUser;
  const solanaWalletPath = appKitPath && !isCircleUser;
  // Circle users default to the deposit path even before the depositMode init
  // effect flips (so the card never flashes a connect prompt while auth loads).
  const depositPath = !appKitPath && isCircleUser && (depositMode || !walletConnected);
  // Connect-wallet prompt is web3-only now. Circle users are never asked to
  // connect: they always have the no-connect deposit path above.
  const needsConnect = !appKitPath && !walletConnected && !depositMode && !isCircleUser;

  // Pre-warm the App Kit chunks once a bridge is plausible (Solana selected or
  // a wallet connected), so the dynamic import in startAppKitBridge is already
  // cached and the click -> sign flow isn't delayed by a cold module load.
  useEffect(() => {
    if (!appKitPath && !walletConnected) return;
    void import('@circle-fin/app-kit').catch(() => {});
    void import(appKitPath ? '@circle-fin/adapter-solana-kit' : '@circle-fin/adapter-viem-v2').catch(() => {});
  }, [appKitPath, walletConnected]);

  // Source-chain USDC balance shown on the amount field. The deposit path reads
  // the polled DCW balance; the connect-wallet path reads the connected
  // wallet's balance on the selected EVM source. Solana (App-Kit-only) has no
  // frontend balance read.
  const web3SourceBal = useBalance({
    address: web3Address,
    token: evmSource?.usdc,
    chainId: evmSource?.chainId,
    // Refetch every 5s so a fresh source-chain faucet claim shows up without a
    // page refresh.
    query: { enabled: !!evmSource && walletConnected, refetchInterval: 5_000 },
  });
  const sourceBalance: string | null = appKitPath
    ? solana.usdcBalance
    : depositPath
      ? circleWallet?.usdcBalance ?? null
      : web3SourceBal.data
        ? formatUnits(web3SourceBal.data.value, web3SourceBal.data.decimals)
        : null;
  // The wagmi wallet may be on Arc (the user just funded an agent there) or on
  // any other chain. The bridge flow switches it automatically, but the CTA
  // label tells the user that's about to happen so the wallet pop-up isn't a
  // surprise.
  const onWrongChain =
    !!evmSource && isConnected && walletChainId !== evmSource.chainId;

  const sourceShortName = evmSource?.shortName ?? appKitSource?.shortName ?? '';

  // Button gates, split by path:
  //   - canBridgeSolana: Solana wallet connected, amount + recipient set. The
  //     user signs the burn in their wallet; the forwarder mints on Arc.
  //   - canSwitch: connect-wallet path on the wrong EVM chain; switch first.
  //   - canBurn:   connect-wallet path on the right chain, amount + recipient set.
  //   - canBridgeCircle: deposit path, amount + recipient set (backend signs).
  /// The burn makes the user the fee payer AND the rent payer for the
  /// MessageSent event account, so with no SOL the transaction cannot even be
  /// SIMULATED: Phantom opens, renders an empty preview, and leaves Confirm
  /// greyed out forever. That dead dialog is indistinguishable from a broken
  /// app, so refuse the burn here and say why, rather than handing Phantom a
  /// transaction it can never let the user sign.
  const solanaNeedsGas =
    appKitPath && solana.solBalance !== null && solana.solBalance < SOLANA_MIN_SOL;
  const canBridgeSolana =
    solanaWalletPath &&
    !!solana.address &&
    !solanaNeedsGas &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!mintRecipient &&
    recipientReady;
  // Email accounts: nothing to connect, so the gates are just amount + target.
  const canBridgeSolanaDeposit =
    solanaDepositPath &&
    !!auth.address &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!mintRecipient &&
    recipientReady;
  const canSwitch = walletPath && !!evmSource && onWrongChain && !isSwitching;
  const canBurn =
    walletPath &&
    !!evmSource &&
    !onWrongChain &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!mintRecipient &&
    recipientReady &&
    !isSwitching;
  const canBridgeCircle =
    depositPath &&
    !!auth.address &&
    typeof amount === 'number' &&
    amount > 0 &&
    !!mintRecipient &&
    recipientReady;
  const canSubmit =
    canBridgeSolana || canBridgeSolanaDeposit || canBridgeCircle || canSwitch || canBurn;


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Solana: the user signs the burn in their wallet; the forwarder mints on
    // Arc. Recipient is the user's own Arc address (mintRecipient).
    if (appKitPath) {
      // Email account: the backend signs from their Solana deposit wallet.
      if (solanaDepositPath && auth.address) {
        if (!canBridgeSolanaDeposit || !mintRecipient) return;
        startCircleAppKit({
          sourceChainKey: sourceKey as 'solanaDevnet',
          amountUsdc: amount as number,
          mintRecipient,
          userAddress: auth.address,
        });
        return;
      }
      if (!canBridgeSolana || !mintRecipient) return;
      startAppKitBridge({ sourceChainKey: sourceKey, amountUsdc: amount as number, mintRecipient });
      return;
    }
    // Deposit path: the backend signs the EVM burn from the provisioned DCW.
    if (depositPath && auth.address) {
      if (!canBridgeCircle) return;
      startCircle({
        sourceChainKey: sourceKey as CctpChainKey,
        amountUsdc: amount as number,
        mintRecipient: mintRecipient as `0x${string}`,
        userAddress: auth.address,
      });
      return;
    }
    // Connect-wallet path.
    if (!walletConnected) {
      openConnectModal?.();
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
    // EVM connect-wallet now routes through App Kit + the Forwarding Service,
    // same as Solana: the wallet signs the burn (it is already on the source
    // chain after the switch step above) and the forwarder mints on Arc.
    startAppKitBridge({
      sourceChainKey: sourceKey,
      amountUsdc: amount as number,
      mintRecipient,
      getEvmProvider: () =>
        connector?.getProvider() ?? Promise.reject(new Error('Wallet provider unavailable')),
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
        {solanaDepositPath && auth.address && (
          <SolanaDepositBanner userAddress={auth.address} copy={bc.solanaFund} />
        )}
        {solanaWalletPath && <SolanaConnectCard wallet={solana} copy={bc.solana} />}
        {depositPath && (
          <CircleSourceFundBanner
            sourceChainKey={sourceKey as CctpChainKey}
            wallet={circleWallet}
            gasSponsored={circleWallet?.gasSponsored ?? false}
            copy={bc.circleFund}
          />
        )}
        {walletPath && evmSource && (
          <Web3FundHint source={evmSource} fundAddress={web3Address} copy={bc.web3Fund} />
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
            eyebrow={bc.eyebrow.sourceChain}
            copy={bc.sourceChain}
            // Not depositPath: that is false while Solana is selected, which
            // would re-enable the six chains no Circle wallet can sign on.
            circlePath={isCircleUser && (depositMode || !walletConnected)}
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
                  {bc.amount.balanceTemplate.replace(
                    '{amount}',
                    sourceBalance != null ? formatUsdc(sourceBalance, { withSuffix: false }) : '0',
                  )}
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

          {/* DESTINATION. The default flow lands the money in the user's own
              Arc wallet, shown as a calm one-line summary. Agents and a
              custom address live behind the "Send somewhere else" disclosure
              so the common path stays a single decision. */}
          {recipientOpen ? (
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
          ) : (
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
              {mintRecipient && <WalletAvatar address={mintRecipient} size={24} />}
              <div className="flex-1 min-w-0">
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
                  {bc.eyebrow.mintsTo}
                </span>
                <p className="mt-0.5 text-[13px] font-semibold leading-tight text-[var(--lp-dark)]">
                  {bc.recipient.selfSummary}
                </p>
                {mintRecipient && (
                  <p className="mt-0.5 mono text-[10px] tabular-nums text-[var(--lp-text-muted)] truncate">
                    {shortAddress(mintRecipient)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRecipientOpen(true)}
                className="shrink-0 mono text-[10px] uppercase tracking-[0.12em] font-bold text-[var(--lp-dark)] hover:opacity-80 transition-opacity underline-offset-2 hover:underline"
              >
                {bc.recipient.sendElsewhere}
              </button>
            </div>
          )}

          {/* PRIMARY ACTION. Connect a wallet first; once connected (or in the
              Circle deposit fallback) the same slot submits the top-up. */}
          {needsConnect ? (
            <button
              type="button"
              data-guide="bridge-submit"
              onClick={() => openConnectModal?.()}
              className="group relative w-full px-4 py-3 mono text-[13px] font-bold uppercase tracking-[0.08em] inline-flex items-center justify-center gap-2 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
              style={{
                background: 'var(--lp-accent)',
                color: 'var(--lp-dark)',
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 4,
                boxShadow: '0 4px 0 rgba(0,0,0,0.22)',
              }}
            >
              <span>{bc.connect.cta}</span>
              <span aria-hidden className="inline-flex transition-transform group-hover:translate-x-0.5">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          ) : (
            <button
              type="submit"
              data-guide="bridge-submit"
              disabled={!canSubmit || startingBridge}
              aria-busy={startingBridge}
              className="group relative w-full px-4 py-3 mono text-[13px] font-bold uppercase tracking-[0.08em] inline-flex items-center justify-center gap-2 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2"
              style={{
                background: 'var(--lp-accent)',
                color: 'var(--lp-dark)',
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 14,
                borderBottomRightRadius: 4,
                boxShadow: canSubmit && !startingBridge ? '0 4px 0 rgba(0,0,0,0.22)' : 'none',
                opacity: startingBridge ? 0.75 : !canSubmit ? 0.4 : 1,
              }}
            >
              <span>
                {/* The label has to change. Leaving it on "Add money from X"
                    while the transfer runs, with only a 14px arrow spinning,
                    read as though the click had done nothing. */}
                {startingBridge
                  ? bc.submit.starting
                  : appKitPath || depositPath
                    ? bc.submit.bridgeFromTemplate.replace('{chain}', sourceShortName)
                    : isSwitching
                      ? bc.submit.switchingToTemplate.replace('{chain}', sourceShortName)
                      : onWrongChain
                        ? bc.submit.switchToTemplate.replace('{chain}', sourceShortName)
                        : bc.submit.bridgeFromTemplate.replace('{chain}', sourceShortName)}
              </span>
              <span aria-hidden className="inline-flex transition-transform group-hover:translate-x-0.5">
                {startingBridge ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="animate-spin">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.25" />
                    <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          )}

          <p className="text-[11px] leading-snug text-[var(--lp-text-muted)]">
            {needsConnect ? bc.connect.hint : bc.reassurance}
          </p>

          {/* Circle accounts can add money without a browser wallet through a
              deposit address; the connected-wallet path is the default. Hidden
              for Solana, which is always a deposit-address flow. */}
          {isCircleUser && !appKitPath &&
            (depositMode ? (
              <button
                type="button"
                onClick={() => setDepositMode(false)}
                className="mono text-[10px] uppercase tracking-[0.12em] font-bold text-[var(--lp-dark)] hover:opacity-80 transition-opacity underline-offset-2 hover:underline"
              >
                {bc.connect.useWallet}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDepositMode(true)}
                className="mono text-[10px] uppercase tracking-[0.12em] font-bold text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] transition-colors underline-offset-2 hover:underline"
              >
                {bc.connect.useDeposit}
              </button>
            ))}
        </form>

        {/* Temporary activity strip: in-flight + recently completed transfers,
            each with a tx link. It auto-clears finished rows after a few
            minutes, or the user dismisses them. The permanent record lives in
            the page's Transfer history modal and the /activity feed. */}
        <BridgeActivityStrip records={inBridgesAll} hidden={hiddenIds} isActive={isActive} />
      </div>
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
  // Out-bridges (Arc -> chain) carry the DESTINATION in sourceChainKey and burn
  // on Arc. Rendering them source-oriented mislabelled an Arc->Ethereum cash-out
  // as "from Ethereum" with an "Add to Arc" ladder and the wrong explorer links.
  const isOut = bridge.direction === 'out';
  const tone = phaseTone(bridge.phase);
  const idx = stepIndexFor(bridge.phase);
  // Instant Arc sends are terminal one-shot transfers, not CCTP bridges: no
  // recheck/retry (nothing to re-drive on chain), and no step ladder.
  const isArc = (bridge.sourceChainKey as string) === 'arc';
  const isStuck =
    !isArc &&
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
        className="w-full text-start p-4 ps-5 flex items-center gap-3"
      >
        {/* Hero amount + subtitle. The chain glyphs and time chip used to
            compete with the amount for attention; this layout puts the
            number first, route + time as a quiet subtitle below. */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-sans text-[22px] font-extrabold tabular-nums leading-none tracking-[-0.02em] text-[var(--lp-dark)]">
              {formatUsdc(bridge.amountUsdc, { withSuffix: false })}
            </span>
            <span className="text-[11px] mono uppercase tracking-[0.12em] text-[var(--lp-text-muted)] leading-none">
              USDC
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-[var(--lp-text-sub)] tabular-nums truncate">
            {(isOut ? copy.routeToTemplate : copy.routeFromTemplate).replace(
              '{chain}',
              meta.shortName,
            )}
            <span className="mx-1.5 text-[var(--lp-text-muted)]">·</span>
            <span className="mono text-[var(--lp-text-muted)]">
              {elapsed(bridge.startedAt, copy.elapsed)}
            </span>
            {isStuck && (
              <>
                <span className="mx-1.5 text-[var(--lp-text-muted)]">·</span>
                <span
                  className="mono text-[10px] uppercase tracking-[0.14em] font-bold"
                  style={{ color: TONE_HEX.warning }}
                >
                  {copy.stale}
                </span>
              </>
            )}
          </div>
        </div>
        {/* Single status pill. Active phases append a step counter
            (e.g. "ATTESTING · 2/4") so the 4-segment progress bar can be
            retired entirely. Terminal phases show just the label. */}
        <StatusPill
          tone={tone}
          label={phaseLabel(bridge.phase, copy.phase, meta.shortName)}
          stepIdx={idx + 1}
          totalSteps={STEP_ORDER.length}
          isInflight={
            tone === 'live' &&
            bridge.phase !== 'done' &&
            bridge.phase !== 'error'
          }
        />
        <svg
          width="12"
          height="12"
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

      {expanded && (
        <div className="border-t border-[var(--lp-border-light)] px-3 py-3 space-y-3">
          {!isArc && <BridgeSteps bridge={bridge} copy={copy.steps} />}

          {bridge.error && <ErrorBanner message={bridge.error} copy={copy.error} />}

          {(bridge.burnTxHash || bridge.mintTxHash) && (
            <div className="space-y-1.5">
              {bridge.burnTxHash && (
                <a
                  href={
                    isOut
                      ? ARC_EXPLORER_TX(bridge.burnTxHash)
                      : meta.explorerTx(bridge.burnTxHash)
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline justify-between gap-3 text-[11px] hover:text-[var(--lp-dark)] text-[var(--lp-text-sub)] py-0.5 transition-colors"
                >
                  <span className="mono uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    {copy.burnLabelTemplate.replace(
                      '{chain}',
                      (isOut ? 'Arc' : meta.shortName).toUpperCase(),
                    )}
                  </span>
                  <span className="mono inline-flex items-center gap-1 tabular-nums">
                    {shortHash(bridge.burnTxHash)}
                    <ExternalIcon />
                  </span>
                </a>
              )}
              {bridge.mintTxHash && (
                <a
                  href={
                    isOut
                      ? meta.explorerTx(bridge.mintTxHash)
                      : ARC_EXPLORER_TX(bridge.mintTxHash)
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-baseline justify-between gap-3 text-[11px] hover:text-[var(--lp-dark)] text-[var(--lp-text-sub)] py-0.5 transition-colors"
                >
                  <span className="mono uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    {isOut
                      ? copy.mintLabelOutTemplate.replace('{chain}', meta.shortName.toUpperCase())
                      : copy.mintLabel}
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
            {(isStuck || bridge.phase === 'error') && !isArc && (
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
            {bridge.phase === 'error' && !isArc && (
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
  // Out-bridges prepare + send on ARC and land on the destination chain. The
  // "~10-19 MIN" hint is an Ethereum-source finality estimate; Arc burns
  // normally attest in seconds, so out records show no estimate.
  const isOut = bridge.direction === 'out';
  const prepChain = isOut ? 'Arc' : meta.shortName;
  const steps: Array<{ key: BridgePhase; label: string; hint?: string }> = [
    { key: 'approving', label: copy.approveTemplate.replace('{chain}', prepChain) },
    { key: 'burning', label: copy.burnTemplate.replace('{chain}', prepChain) },
    {
      key: 'attesting',
      label: copy.circleAttestation,
      ...(isOut ? {} : { hint: copy.attestationHint }),
    },
    {
      key: 'minting',
      label: isOut ? copy.mintToTemplate.replace('{chain}', meta.shortName) : copy.mintArc,
    },
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

/// Single status pill for the redesigned bridge row. Replaces PhaseChip +
/// SegmentedProgress as the only visual color: terminal phases show just
/// the label (BRIDGED, FAILED); in-flight phases append a step counter so
/// the user still sees forward progress without the 4-segment bar fighting
/// the row for attention. Tone drives a single solid background; no
/// gradients, no LED dot, the pill IS the indicator.
function StatusPill({
  tone,
  label,
  stepIdx,
  totalSteps,
  isInflight,
}: {
  tone: 'live' | 'positive' | 'critical';
  label: string;
  stepIdx: number;
  totalSteps: number;
  isInflight: boolean;
}) {
  const fg =
    tone === 'positive'
      ? TONE_HEX.positive
      : tone === 'critical'
        ? TONE_HEX.critical
        : 'var(--lp-dark)';
  const bg =
    tone === 'positive'
      ? 'rgba(10,117,83,0.12)'
      : tone === 'critical'
        ? 'rgba(176,61,58,0.12)'
        : 'rgba(175,201,91,0.20)';
  const border =
    tone === 'positive'
      ? 'rgba(10,117,83,0.30)'
      : tone === 'critical'
        ? 'rgba(176,61,58,0.30)'
        : 'rgba(175,201,91,0.50)';
  return (
    <span
      className="shrink-0 inline-flex items-center mono text-[10px] font-bold uppercase tracking-[0.14em] leading-none px-2.5 py-1.5 whitespace-nowrap"
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      <span>{label}</span>
      {isInflight && totalSteps > 0 && (
        <span className="ms-1.5 opacity-70 tabular-nums">
          · {Math.max(1, Math.min(stepIdx, totalSteps))}/{totalSteps}
        </span>
      )}
    </span>
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
/// once, from a faucet or any external wallet, and the backend signs burns
/// from it. We poll the live balance so the user can confirm their deposit
/// landed; an empty wallet is the #1 cause of "circle bridge doesn't work".
function CircleSourceFundBanner({
  sourceChainKey,
  wallet,
  gasSponsored,
  copy,
}: {
  sourceChainKey: SourceChainConfig['key'];
  wallet: { address: string; usdcBalance: string | null; gasBalance: string | null } | null;
  /// Whether Gas Station really covers this chain, as reported by the backend
  /// that enforces it. When false Karwan pays the fee by funding the deposit
  /// wallet instead — but if that wallet is actually dry the banner has to say
  /// so, because the bridge will refuse and the user deserves to know before
  /// they press the button, not after.
  gasSponsored: boolean;
  copy: Messages['bridgeCard']['circleFund'];
}) {
  const [claiming, setClaiming] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const address = wallet?.address ?? null;

  // The bridge route refuses below ~0.0002 native, so mirror that threshold
  // here. Only meaningful once a balance has actually been read: a null is
  // "not known yet", not "empty".
  const gasDry =
    !gasSponsored && wallet?.gasBalance != null && Number(wallet.gasBalance) < 0.0002;

  // In-app USDC top-up straight to this source-chain Circle wallet, so the user
  // never leaves the page. USDC only: Circle users don't need native gas here
  // (Gas Station sponsors the burn) and Circle's faucet declines native to these
  // wallets. Rate limits surface as a clear line, not a silent no-op.
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
  // the balance read hasn't returned yet (or failed), stay neutral.
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
              style={{ color: gasDry ? TONE_HEX.warning : TONE_HEX.positive }}
            >
              {gasSponsored ? copy.sponsored : gasDry ? copy.needed : copy.covered}
            </p>
          </div>
        </div>
        {/* No explainer paragraph here. The SPONSORED tag above already says
            it; a sentence repeating it is one more thing to read past. */}

        {/* ADD FUNDS. The deposit wallet is the user's own unified address now,
            so there is no separate address to surface or copy. On testnet this
            drips test USDC straight to it; on mainnet the funds arrive through
            the normal add-money flow to the same wallet. */}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={claimUsdc}
            disabled={!address || claiming}
            className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1 px-2.5 py-1 disabled:opacity-50"
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
        {note && (
          <p
            className="mt-2 text-[11px] leading-snug"
            style={{ color: note.kind === 'err' ? TONE_HEX.warning : 'var(--lp-text-sub)' }}
          >
            {note.text}
          </p>
        )}
      </div>
    </div>
  );
}

/// Solana for an EMAIL account. Circle holds a Solana wallet for the user, so
/// they fund an address and the backend signs the burn — no Phantom, same shape
/// as every EVM chain. The one honest difference: Circle does NOT sponsor gas
/// for transfers that originate on Solana, so this wallet needs a little SOL of
/// its own. That is stated in one line rather than hidden.
function SolanaDepositBanner({
  userAddress,
  copy,
}: {
  userAddress: string;
  copy: Messages['bridgeCard']['solanaFund'];
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  // Solana is a separate EOA curve, so its deposit address can't be the user's
  // unified EVM address — it has to be provisioned on its own. Circle's SOL-DEVNET
  // create call sometimes never returns; a silent catch here left the card stuck
  // on "setting up…" forever. Surface the failure and let the user retry.
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api
      .bridgeCircleSourceAddress(userAddress, 'solanaDevnet')
      .then((r) => !cancelled && setAddress(r.address))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [userAddress, attempt]);

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
        style={{ background: 'var(--lp-accent)' }}
      />
      <div className="px-4 py-3 ps-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              {copy.addressLabel}
            </p>
            <p
              className="mt-0.5 mono text-[12px] tabular-nums truncate"
              style={{ color: failed && !address ? TONE_HEX.warning : 'var(--lp-dark)' }}
            >
              {address ?? (failed ? copy.setupFailed : copy.provisioning)}
            </p>
          </div>
          {failed && !address ? (
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="shrink-0 mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] hover:opacity-80 transition-opacity px-2 py-1 border border-black/15"
              style={{
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 2,
              }}
            >
              {copy.retry}
            </button>
          ) : (
            <button
              type="button"
              onClick={copyAddress}
              disabled={!address}
              className="shrink-0 mono text-[10px] uppercase tracking-[0.14em] font-bold text-[var(--lp-dark)] hover:opacity-80 transition-opacity disabled:opacity-50 px-2 py-1 border border-black/15"
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
          )}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-[var(--lp-text-sub)]">{copy.note}</p>
        <div className="mt-1.5">
          <a
            href="https://faucet.solana.com/"
            target="_blank"
            rel="noreferrer"
            className="mono text-[9px] uppercase tracking-[0.16em] font-bold inline-flex items-center gap-1 text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] transition-colors"
          >
            {copy.faucet}
            <ExternalIcon />
          </a>
        </div>
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
  fundAddress,
  copy,
}: {
  source: SourceChainConfig;
  /// The connected wallet that signs the burn. For a Circle account using a
  /// wallet to fund, this is NOT auth.address (the Circle identity), so the
  /// faucet must target the connected wallet explicitly or the USDC lands in
  /// the wrong place.
  fundAddress?: string;
  copy: Messages['bridgeCard']['web3Fund'];
}) {
  // Copy the connected wallet address, then open the faucet in a new tab so the
  // user pastes it there. Same pattern as the profile wallet faucets and the
  // Solana connect card, applied to every source chain.
  const [copied, setCopied] = useState<'usdc' | 'gas' | null>(null);
  async function copyAndOpen(url: string, key: 'usdc' | 'gas') {
    if (fundAddress) {
      try {
        await navigator.clipboard.writeText(fundAddress);
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
      } catch {
        /* clipboard can fail in unfocused tabs; still open the faucet */
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
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
        <button
          type="button"
          onClick={() => void copyAndOpen(USDC_FAUCET, 'usdc')}
          disabled={!fundAddress}
          className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1 px-2.5 py-1 disabled:opacity-50"
          style={{
            background: 'var(--lp-accent)',
            color: 'var(--lp-band-dark)',
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 2,
          }}
        >
          {copied === 'usdc' ? copy.copied : copy.getTestUsdc}
          <ExternalIcon />
        </button>
        <button
          type="button"
          onClick={() => {
            const faucet = GAS_FAUCETS[source.key];
            if (faucet) void copyAndOpen(faucet, 'gas');
          }}
          hidden={!GAS_FAUCETS[source.key]}
          disabled={!fundAddress}
          className="mono text-[10px] uppercase tracking-[0.14em] font-bold inline-flex items-center gap-1 px-2.5 py-1 border disabled:opacity-50"
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
          {copied === 'gas' ? copy.copied : copy.claimGasTemplate.replace('{native}', source.nativeSymbol)}
          <ExternalIcon />
        </button>
      </div>
    </div>
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

/// Recipient picker for the bridge form. Surfaces the three known-good
/// wallets (identity, buyer agent, seller agent) as one-click choices and a
/// Custom paste box guarded by an on-chain bytecode check. The picker keeps
/// the form clean, only the Custom branch renders the input + warning band.
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
/// chains (Solana). Behaves identically for web3 and Circle users, the
/// only difference is Solana's row is disabled with a "needs Circle" tag
/// for web3 since the app has no Solana wagmi connector. Replaces the
/// previous 6-tile grid which was visually heavy and didn't match the
/// slim destination dropdown on the FROM ARC card.
function SourceChainDropdown({
  value,
  onChange,
  open,
  setOpen,
  eyebrow,
  copy,
  circlePath,
}: {
  value: AnySourceChainKey;
  onChange: (next: AnySourceChainKey) => void;
  open: boolean;
  setOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  eyebrow: string;
  copy: Messages['bridgeCard']['sourceChain'];
  /// True when the burn will be signed by a backend Circle wallet. Six of the
  /// CCTP chains have no Circle wallet (Circle cannot execute contracts there),
  /// so they must be unpickable on this path rather than fail at submit.
  circlePath: boolean;
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
    const cctp = (Object.values(SOURCE_CHAINS) as SourceChainConfig[]).map((c): Option => {
      // Web3-only chain on the Circle deposit path: no backend wallet can sign
      // the burn there, so offer it but say why it is off.
      const needsWallet = circlePath && !CIRCLE_SOURCE_KEYS.has(c.key);
      return {
        key: c.key as AnySourceChainKey,
        name: c.name.replace(' Sepolia', ''),
        meta: copy.sepoliaDomainTemplate.replace('{domain}', String(c.domain)),
        iconKey: c.key,
        disabled: needsWallet,
        disabledTag: needsWallet ? copy.walletOnlyTag : undefined,
        disabledTitle: needsWallet ? copy.walletOnlyTitle : undefined,
      };
    });
    // Solana routes through the backend Circle App Kit signer, so it's usable by
    // every account type (the backend provisions a Solana deposit address the
    // user funds). No longer gated to Circle-only.
    const appKit = APP_KIT_SOURCE_KEYS.map((k): Option => {
      const c = APP_KIT_SOURCES[k];
      return {
        key: k as AnySourceChainKey,
        name: c.shortName,
        meta: copy.devnetAppKit,
        iconKey: 'solana',
        disabled: false,
      };
    });
    return [...cctp, ...appKit];
  }, [copy, circlePath]);

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
            className="absolute z-20 start-0 end-0 mt-2 p-1.5 fade-up max-h-[300px] overflow-y-auto"
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
