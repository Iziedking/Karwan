'use client';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  useWalletClient,
  usePublicClient,
  useChainId,
  useSwitchChain,
} from 'wagmi';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';
import { SignInGate } from '@/shared/components/SignInGate';
import { Countdown } from '@/shared/components/Countdown';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { useAuth } from '@/shared/hooks/useAuth';
import { api } from '@/core/api';
import { formatUsdc } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  KARWAN_VAULT_LEGACY_ADDRESS,
  KARWAN_VAULT_LEGACY_ADDRESS_2,
} from '@/features/profile/config';

/// 30-day recovery surface for the pre-v2.D KarwanEscrow + KarwanVault. One
/// page, two sections. Reads stay open forever via /api/legacy/window; writes
/// refuse with 410 once the window closes.

const vaultAbi = [
  {
    type: 'function',
    name: 'requestWithdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelWithdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [],
  },
] as const;

interface Window {
  open: boolean;
  closesAtMs: number | null;
  hasLegacyEscrow: boolean;
  hasLegacyVault: boolean;
}

export default function LegacyPage() {
  const { isAuthenticated, address, method } = useAuth();
  const [windowState, setWindowState] = useState<Window | null>(null);

  useEffect(() => {
    api
      .legacyWindow()
      .then((r) =>
        setWindowState({
          open: r.open,
          closesAtMs: r.closesAtMs,
          hasLegacyEscrow: r.hasLegacyEscrow,
          hasLegacyVault: r.hasLegacyVault,
        }),
      )
      .catch(() => setWindowState({ open: false, closesAtMs: null, hasLegacyEscrow: false, hasLegacyVault: false }));
  }, []);

  if (!isAuthenticated || !address) {
    return (
      <SignInGate
        tag="LEGACY · RECOVERY"
        title={
          <>
            Reclaim from <Accent>previous</Accent> contracts
            <Punc>.</Punc>
          </>
        }
        body={
          <>
            We redeployed our escrow and vault contracts. Funds and stake parked on the previous
            contracts stay yours. Sign in to see what you can reclaim.
          </>
        }
        buttonLabel="Sign in to continue"
      />
    );
  }

  if (windowState && !windowState.open) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[60ch]">
            <SectionTag tone="dark">RECOVERY WINDOW</SectionTag>
            <HeroHeadline size="md">
              Closed<Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              The 30-day recovery window has ended. The legacy contracts remain live on Arc and
              can still be called directly via the block explorer if you have funds locked. Reach
              out on Telegram if you need help and didn't get a chance to reclaim.
            </p>
            <Link
              href="/"
              className="mt-8 inline-flex items-center gap-2 px-5 py-3 mono text-[12px] font-bold uppercase tracking-[0.08em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)]"
              style={{
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              ← Home
            </Link>
          </div>
        </Band>
      </FullBleed>
    );
  }

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[64ch]">
          <SectionTag tone="dark" dot="live">
            LEGACY · RECOVERY OPEN
          </SectionTag>
          <HeroHeadline size="md">
            Reclaim from <Accent>previous</Accent> contracts
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[58ch]">
            We upgraded our escrow and vault to v2.D. Anything you staked or any deal you funded
            on the previous contracts still belongs to you. This page lets you pull it out before
            the recovery window closes.
          </p>
          <div
            className="mt-7 inline-flex items-center gap-3 px-4 py-2.5"
            style={{
              background: 'color-mix(in oklab, var(--lp-accent) 14%, transparent)',
              border: '1px solid color-mix(in oklab, var(--lp-accent) 35%, transparent)',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-accent)]">
              window closes in
            </span>
            <span className="mono text-[14px] sm:text-[16px] font-extrabold text-white tabular-nums">
              {windowState?.closesAtMs ? <Countdown targetMs={windowState.closesAtMs} /> : '...'}
            </span>
          </div>
          <p className="mt-5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] leading-relaxed">
            // AFTER THE WINDOW, THE LEGACY CONTRACTS STAY LIVE ON ARC AND CAN BE CALLED DIRECTLY VIA THE EXPLORER
          </p>
        </div>
      </Band>

      <Band tone="light" compact>
        <SectionTag>LEGACY STAKE</SectionTag>
        <HeroHeadline size="md">
          Your stake<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[58ch]">
          Positions parked on the previous KarwanVault. Cool-down on this contract is 7 days. New
          deposits go to the v2.D vault. Visit{' '}
          <Link href="/stake" className="underline underline-offset-2">/stake</Link> for that.
        </p>
        <div className="mt-8">
          <LegacyStakeCard address={address} isCircleUser={method === 'circle'} />
        </div>
      </Band>

      <Band tone="light" compact>
        <SectionTag>LEGACY DEALS</SectionTag>
        <HeroHeadline size="md">
          Pending escrow<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[58ch]">
          Deals where USDC is still locked on the previous escrow. Buyer can refund (after the
          deadline) or release if the seller delivered. Either party can propose a mutual
          cancellation.
        </p>
        <div className="mt-8">
          <LegacyDealsList address={address} />
        </div>
      </Band>
    </FullBleed>
  );
}

// ---------------------------------------------------------------------------
// LEGACY STAKE
// ---------------------------------------------------------------------------

interface LegacyPosition {
  positionId: string;
  principalUsdc: string;
  depositedAt: number;
  cooldownStartedAt: number;
  claimableAt: number;
  state: 'active' | 'cooling' | 'claimed';
  generation: 1 | 2;
}

function vaultAddressForGeneration(gen: 1 | 2): `0x${string}` | null {
  return gen === 1 ? KARWAN_VAULT_LEGACY_ADDRESS : KARWAN_VAULT_LEGACY_ADDRESS_2;
}

type StakeBusy = { kind: 'request' | 'cancel' | 'claim'; positionId: string } | null;

function LegacyStakeCard({
  address,
  isCircleUser,
}: {
  address: string;
  isCircleUser: boolean;
}) {
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [positions, setPositions] = useState<LegacyPosition[]>([]);
  const [totalActive, setTotalActive] = useState('0');
  const [totalCooling, setTotalCooling] = useState('0');
  const [cooldownDays, setCooldownDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<StakeBusy>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{ positionId: string; principal: string } | null>(null);

  const onWrongChain = !isCircleUser && chainId !== ARC_CHAIN_ID;

  const refetch = useCallback(async () => {
    try {
      const r = await api.legacyVaultPositions(address);
      setPositions(r.positions);
      setTotalActive(r.totalActiveUsdc);
      setTotalCooling(r.totalCoolingUsdc);
      setCooldownDays(r.cooldownDays);
    } catch (err) {
      setLastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 10_000);
    return () => clearInterval(id);
  }, [refetch]);

  const runAction = useCallback(
    async (kind: 'request' | 'cancel' | 'claim', positionId: string) => {
      setLastError(null);
      setLastTx(null);
      if (onWrongChain) {
        try {
          await switchChainAsync({ chainId: ARC_CHAIN_ID });
        } catch {
          // user declined
        }
        return;
      }
      if (kind === 'request') {
        const target = positions.find((p) => p.positionId === positionId);
        setPendingRequest({
          positionId,
          principal: target?.principalUsdc ?? '0',
        });
        return;
      }
      setBusy({ kind, positionId });
      try {
        const target = positions.find((p) => p.positionId === positionId);
        const generation = target?.generation ?? 1;
        const vaultAddrForAction = vaultAddressForGeneration(generation);
        if (isCircleUser) {
          const route =
            kind === 'cancel' ? api.legacyVaultCancelWithdraw : api.legacyVaultClaim;
          const r = await route({ address, positionId, generation });
          setLastTx(r.txHash);
        } else {
          if (!walletClient || !arcClient) throw new Error('Wallet not ready. Reconnect and retry.');
          if (!vaultAddrForAction) {
            throw new Error(`Legacy vault for generation ${generation} is not configured on this build.`);
          }
          const fnName = kind === 'cancel' ? 'cancelWithdraw' : 'claim';
          const hash = await walletClient.writeContract({
            address: vaultAddrForAction,
            abi: vaultAbi,
            functionName: fnName,
            args: [BigInt(positionId)],
            chain: walletClient.chain,
            account: address as `0x${string}`,
          });
          await arcClient.waitForTransactionReceipt({ hash });
          setLastTx(hash);
        }
        await refetch();
      } catch (err) {
        setLastError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [onWrongChain, switchChainAsync, isCircleUser, positions, walletClient, arcClient, address, refetch],
  );

  const confirmRequest = useCallback(async () => {
    if (!pendingRequest) return;
    const positionId = pendingRequest.positionId;
    setPendingRequest(null);
    setLastError(null);
    setLastTx(null);
    setBusy({ kind: 'request', positionId });
    try {
      const target = positions.find((p) => p.positionId === positionId);
      const generation = target?.generation ?? 1;
      const vaultAddrForAction = vaultAddressForGeneration(generation);
      if (isCircleUser) {
        const r = await api.legacyVaultRequestWithdraw({ address, positionId, generation });
        setLastTx(r.txHash);
      } else {
        if (!walletClient || !arcClient) throw new Error('Wallet not ready. Reconnect and retry.');
        if (!vaultAddrForAction) {
          throw new Error(`Legacy vault for generation ${generation} is not configured on this build.`);
        }
        const hash = await walletClient.writeContract({
          address: vaultAddrForAction,
          abi: vaultAbi,
          functionName: 'requestWithdraw',
          args: [BigInt(positionId)],
          chain: walletClient.chain,
          account: address as `0x${string}`,
        });
        await arcClient.waitForTransactionReceipt({ hash });
        setLastTx(hash);
      }
      await refetch();
    } catch (err) {
      setLastError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [pendingRequest, positions, isCircleUser, walletClient, arcClient, address, refetch]);

  if (loading) {
    return <div className="h-32 bg-black/[0.04] animate-pulse rounded-2xl" />;
  }

  if (positions.length === 0) {
    return (
      <Note tone="info">
        <span className="font-semibold">Nothing to recover.</span> No positions on the previous
        vault for this wallet.
      </Note>
    );
  }

  const active = positions.filter((p) => p.state === 'active');
  const cooling = positions.filter((p) => p.state === 'cooling');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat label="Active" value={`${formatUsdc(totalActive, { withSuffix: false })} USDC`} />
        <Stat label="Cooling" value={`${formatUsdc(totalCooling, { withSuffix: false })} USDC`} />
      </div>

      {onWrongChain && (
        <Note tone="warn">
          Your wallet is on another network. Switch to Arc to sign legacy actions.
        </Note>
      )}

      {active.length > 0 && (
        <PositionGroup
          title="Active. Start cool-down to recover"
          positions={active}
          busy={busy}
          onAction={runAction}
          actionLabel={`Start ${cooldownDays}-day cool-down`}
          actionKind="request"
        />
      )}

      {cooling.length > 0 && (
        <CoolingGroup positions={cooling} busy={busy} onAction={runAction} />
      )}

      {lastTx && (
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          tx{' '}
          <a
            href={ARC_EXPLORER_TX(lastTx)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-[var(--lp-dark)]"
          >
            {lastTx.slice(0, 10)}…{lastTx.slice(-6)} ↗
          </a>
        </p>
      )}
      {lastError && <Note tone="warn">{lastError}</Note>}

      <ConfirmDialog
        open={pendingRequest != null}
        title={`Cool ${pendingRequest?.principal ?? ''} USDC?`}
        body={
          <>
            Starts the {cooldownDays}-day cool-down on this legacy position. Once it elapses you
            can claim the principal back to your wallet. Cooling stake stops earning reputation
            until you cancel or claim.
          </>
        }
        confirmLabel="Start cool-down"
        onCancel={() => setPendingRequest(null)}
        onConfirm={confirmRequest}
      />
    </div>
  );
}

function PositionGroup({
  title,
  positions,
  busy,
  onAction,
  actionLabel,
  actionKind,
}: {
  title: string;
  positions: LegacyPosition[];
  busy: StakeBusy;
  onAction: (kind: 'request' | 'cancel' | 'claim', positionId: string) => void;
  actionLabel: string;
  actionKind: 'request';
}) {
  return (
    <div className="space-y-2.5">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {title}
      </p>
      <ul className="space-y-2">
        {positions.map((p) => {
          const isBusy = busy?.positionId === p.positionId;
          return (
            <li
              key={p.positionId}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={{
                background: 'var(--lp-card)',
                border: '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <div className="min-w-0">
                <p className="font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.02em] leading-none">
                  {formatUsdc(p.principalUsdc, { withSuffix: false })}{' '}
                  <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] font-normal">
                    USDC · #{p.positionId} · GEN {p.generation}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onAction(actionKind, p.positionId)}
                disabled={isBusy}
                className={cn(
                  'shrink-0 px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.08em]',
                  'bg-[var(--lp-band-dark)] text-[var(--lp-accent)] hover:bg-black/85 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                style={{
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 10,
                  borderBottomRightRadius: 2,
                }}
              >
                {isBusy ? 'Signing…' : actionLabel}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CoolingGroup({
  positions,
  busy,
  onAction,
}: {
  positions: LegacyPosition[];
  busy: StakeBusy;
  onAction: (kind: 'request' | 'cancel' | 'claim', positionId: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        Cooling. Claim once the countdown ends
      </p>
      <ul className="space-y-2">
        {positions.map((p) => {
          const isBusy = busy?.positionId === p.positionId;
          const claimable = p.claimableAt > 0 && Math.floor(Date.now() / 1000) >= p.claimableAt;
          const delta = Math.max(0, p.claimableAt - Math.floor(Date.now() / 1000));
          const days = Math.floor(delta / 86_400);
          const hours = Math.floor((delta % 86_400) / 3600);
          return (
            <li
              key={p.positionId}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={{
                background: 'var(--lp-card)',
                border: '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <div className="min-w-0">
                <p className="font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.02em] leading-none">
                  {formatUsdc(p.principalUsdc, { withSuffix: false })}{' '}
                  <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] font-normal">
                    USDC · #{p.positionId} · GEN {p.generation}
                  </span>
                </p>
                <p className="mt-1 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                  {claimable ? 'claim ready' : `claim in ${days}d ${hours}h`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!claimable && (
                  <button
                    type="button"
                    onClick={() => onAction('cancel', p.positionId)}
                    disabled={isBusy}
                    className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50"
                  >
                    cancel
                  </button>
                )}
                {claimable && (
                  <button
                    type="button"
                    onClick={() => onAction('claim', p.positionId)}
                    disabled={isBusy}
                    className={cn(
                      'px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.08em]',
                      'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                    style={{
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomLeftRadius: 10,
                      borderBottomRightRadius: 2,
                    }}
                  >
                    {isBusy ? 'Claiming…' : 'Claim to wallet'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LEGACY DEALS
// ---------------------------------------------------------------------------

interface LegacyDeal {
  jobId: string;
  role: 'buyer' | 'seller' | 'both';
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  state: number;
  stateLabel: 'funded' | 'settled' | 'disputed' | 'refunded' | 'unknown';
  deadlineUnix: number;
  pastDeadline: boolean;
  delivered: boolean;
  hasCancellationProposal: boolean;
  cancellationProposal?: {
    proposedBy: 'buyer' | 'seller';
    kind: string;
    reason: string;
    proposedAt: number;
  };
  createdAt: number;
  releasedUsdc: string;
  generation: 1 | 2;
}

type DealBusy = { jobId: string; kind: 'refund' | 'release' | 'cancel-propose' | 'cancel-accept' } | null;

function LegacyDealsList({ address }: { address: string }) {
  const [deals, setDeals] = useState<LegacyDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<DealBusy>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    kind: 'refund' | 'release' | 'cancel-propose' | 'cancel-accept';
    deal: LegacyDeal;
  } | null>(null);

  const refetch = useCallback(async () => {
    try {
      const r = await api.legacyDeals(address);
      setDeals(r.deals);
    } catch (err) {
      setLastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 15_000);
    return () => clearInterval(id);
  }, [refetch]);

  // Legacy escrow actions always route through the backend agent DCW.
  // The on-chain buyer field on a legacy escrow is the buyer-agent wallet,
  // not the user's identity wallet, so signing with the connected wagmi
  // wallet would always revert NotBuyer. The backend signs with the agent
  // DCW that originally funded the escrow.
  const queueAction = useCallback(
    (deal: LegacyDeal, kind: 'refund' | 'release' | 'cancel-propose' | 'cancel-accept') => {
      setLastError(null);
      setLastTx(null);
      setPendingAction({ kind, deal });
    },
    [],
  );

  const runRefund = useCallback((deal: LegacyDeal) => queueAction(deal, 'refund'), [queueAction]);
  const runRelease = useCallback((deal: LegacyDeal) => queueAction(deal, 'release'), [queueAction]);
  const runProposeCancel = useCallback(
    (deal: LegacyDeal) => queueAction(deal, 'cancel-propose'),
    [queueAction],
  );
  const runAcceptCancel = useCallback(
    (deal: LegacyDeal) => queueAction(deal, 'cancel-accept'),
    [queueAction],
  );

  const executePendingAction = useCallback(
    async (reason?: string) => {
      if (!pendingAction) return;
      const { kind, deal } = pendingAction;
      setPendingAction(null);
      setLastError(null);
      setLastTx(null);
      setBusy({ jobId: deal.jobId, kind });
      const role: 'buyer' | 'seller' = deal.role === 'seller' ? 'seller' : 'buyer';
      try {
        if (kind === 'refund') {
          const r = await api.legacyDealRefund({ jobId: deal.jobId, address, role: 'buyer' });
          setLastTx(r.txHash);
        } else if (kind === 'release') {
          const r = await api.legacyDealReleaseFinal({
            jobId: deal.jobId,
            address,
            role: 'buyer',
          });
          setLastTx(r.txHash);
        } else if (kind === 'cancel-propose') {
          const cleaned = (reason ?? '').trim();
          if (!cleaned) throw new Error('Reason is required to propose a cancellation.');
          const r = await api.legacyDealCancelPropose({
            jobId: deal.jobId,
            address,
            role,
            reason: cleaned,
          });
          setLastTx(r.txHash);
        } else if (kind === 'cancel-accept') {
          const r = await api.legacyDealCancelAccept({ jobId: deal.jobId, address, role });
          setLastTx(r.txHash);
        }
        await refetch();
      } catch (err) {
        setLastError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [pendingAction, address, refetch],
  );

  const open = useMemo(
    () => deals.filter((d) => d.stateLabel === 'funded' || d.stateLabel === 'disputed'),
    [deals],
  );
  const past = useMemo(
    () => deals.filter((d) => d.stateLabel === 'settled' || d.stateLabel === 'refunded'),
    [deals],
  );

  if (loading) {
    return <div className="h-32 bg-black/[0.04] animate-pulse rounded-2xl" />;
  }

  if (deals.length === 0) {
    return (
      <Note tone="info">
        <span className="font-semibold">No legacy deals.</span> You have no escrow records on the
        previous contract.
      </Note>
    );
  }

  return (
    <div className="space-y-6">
      {open.length === 0 ? (
        <Note tone="info">No open legacy deals. Everything past settled or refunded.</Note>
      ) : (
        <div className="space-y-2.5">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            Open. Actions available
          </p>
          <ul className="space-y-3">
            {open.map((deal) => (
              <DealRow
                key={deal.jobId}
                deal={deal}
                busy={busy}
                onRefund={runRefund}
                onRelease={runRelease}
                onProposeCancel={runProposeCancel}
                onAcceptCancel={runAcceptCancel}
              />
            ))}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2.5">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            Past. Already settled or refunded
          </p>
          <ul className="space-y-2">
            {past.map((deal) => (
              <li
                key={deal.jobId}
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={{
                  background: 'var(--lp-card)',
                  border: '1px solid var(--lp-border-light)',
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  borderBottomLeftRadius: 12,
                  borderBottomRightRadius: 3,
                }}
              >
                <div className="min-w-0">
                  <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                    {deal.role} · {deal.stateLabel}
                  </p>
                  <p className="mt-1 font-sans text-[16px] font-extrabold tabular-nums">
                    {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })} USDC
                  </p>
                </div>
                <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
                  {deal.jobId.slice(0, 10)}…{deal.jobId.slice(-6)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastTx && (
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          tx{' '}
          <a
            href={ARC_EXPLORER_TX(lastTx)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-[var(--lp-dark)]"
          >
            {lastTx.slice(0, 10)}…{lastTx.slice(-6)} ↗
          </a>
        </p>
      )}
      {lastError && <Note tone="warn">{lastError}</Note>}

      <ConfirmDialog
        open={pendingAction != null}
        title={dialogTitle(pendingAction?.kind, pendingAction?.deal)}
        body={dialogBody(pendingAction?.kind, pendingAction?.deal)}
        reasonPrompt={
          pendingAction?.kind === 'cancel-propose'
            ? {
                label: 'Reason (shared with the other party)',
                placeholder: 'No longer needed',
                required: true,
              }
            : undefined
        }
        confirmLabel={dialogConfirmLabel(pendingAction?.kind)}
        tone={pendingAction?.kind === 'refund' ? 'danger' : 'primary'}
        onCancel={() => setPendingAction(null)}
        onConfirm={executePendingAction}
      />
    </div>
  );
}

function dialogTitle(
  kind: 'refund' | 'release' | 'cancel-propose' | 'cancel-accept' | undefined,
  deal: LegacyDeal | undefined,
): string {
  if (!kind || !deal) return '';
  if (kind === 'refund') return `Refund ${deal.dealAmountUsdc} USDC to your wallet?`;
  if (kind === 'release') return `Release ${deal.dealAmountUsdc} USDC to the seller?`;
  if (kind === 'cancel-propose') return 'Propose a mutual cancellation?';
  return 'Accept the proposed cancellation?';
}

function dialogBody(
  kind: 'refund' | 'release' | 'cancel-propose' | 'cancel-accept' | undefined,
  deal: LegacyDeal | undefined,
): ReactNode {
  if (!kind || !deal) return null;
  if (kind === 'refund') {
    return (
      <>
        Cancels the deal on the legacy escrow and returns the full {deal.dealAmountUsdc} USDC to
        your wallet. Reputation is unchanged on this recovery path.
      </>
    );
  }
  if (kind === 'release') {
    return (
      <>
        Settles the legacy escrow and pays the seller their {deal.dealAmountUsdc} USDC net of
        platform fees. Use this when the seller already delivered before the contract migration.
      </>
    );
  }
  if (kind === 'cancel-propose') {
    return (
      <>
        Sends a cancellation proposal to the other party. They have to accept before the deal
        cancels. Funds stay locked until they accept or you withdraw the proposal.
      </>
    );
  }
  return (
    <>
      The other party proposed cancelling this deal. Accepting refunds you the full{' '}
      {deal.dealAmountUsdc} USDC and closes the legacy escrow.
    </>
  );
}

function dialogConfirmLabel(
  kind: 'refund' | 'release' | 'cancel-propose' | 'cancel-accept' | undefined,
): string {
  if (kind === 'refund') return 'Refund to buyer';
  if (kind === 'release') return 'Release to seller';
  if (kind === 'cancel-propose') return 'Send proposal';
  if (kind === 'cancel-accept') return 'Accept cancellation';
  return 'Confirm';
}

function DealRow({
  deal,
  busy,
  onRefund,
  onRelease,
  onProposeCancel,
  onAcceptCancel,
}: {
  deal: LegacyDeal;
  busy: DealBusy;
  onRefund: (d: LegacyDeal) => void;
  onRelease: (d: LegacyDeal) => void;
  onProposeCancel: (d: LegacyDeal) => void;
  onAcceptCancel: (d: LegacyDeal) => void;
}) {
  const isBusy = busy?.jobId === deal.jobId;
  const canRefund =
    deal.role === 'buyer' &&
    deal.stateLabel === 'funded' &&
    (deal.pastDeadline || !deal.delivered);
  const canRelease =
    deal.role === 'buyer' && deal.stateLabel === 'funded' && deal.delivered;
  const canAcceptCancel =
    deal.hasCancellationProposal &&
    deal.cancellationProposal &&
    deal.cancellationProposal.proposedBy !== deal.role &&
    deal.role !== 'both';
  const canProposeCancel = !deal.hasCancellationProposal && deal.stateLabel === 'funded';

  return (
    <li
      className="px-5 py-4 space-y-3"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            [:{deal.role.toUpperCase()} · {deal.stateLabel.toUpperCase()} · GEN {deal.generation}:] {deal.jobId.slice(0, 10)}…{deal.jobId.slice(-6)}
          </p>
          <p className="mt-1.5 font-sans text-[22px] font-extrabold tabular-nums tracking-[-0.02em] leading-none">
            {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}{' '}
            <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] font-normal">
              USDC
            </span>
          </p>
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {deal.pastDeadline ? 'past deadline' : 'live'} · {deal.delivered ? 'delivered' : 'not delivered'}
        </span>
      </div>

      {deal.hasCancellationProposal && deal.cancellationProposal && (
        <p className="text-[12.5px] leading-snug text-[var(--lp-dark)]">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mr-2">
            cancel proposed by {deal.cancellationProposal.proposedBy}:
          </span>
          {deal.cancellationProposal.reason}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {canRefund && (
          <ActionButton
            tone="primary"
            disabled={isBusy}
            onClick={() => onRefund(deal)}
            label={isBusy && busy?.kind === 'refund' ? 'Refunding…' : 'Refund to buyer'}
          />
        )}
        {canRelease && (
          <ActionButton
            tone="primary"
            disabled={isBusy}
            onClick={() => onRelease(deal)}
            label={isBusy && busy?.kind === 'release' ? 'Releasing…' : 'Release to seller'}
          />
        )}
        {canAcceptCancel && (
          <ActionButton
            tone="primary"
            disabled={isBusy}
            onClick={() => onAcceptCancel(deal)}
            label={isBusy && busy?.kind === 'cancel-accept' ? 'Accepting…' : 'Accept cancellation'}
          />
        )}
        {canProposeCancel && (
          <ActionButton
            tone="ghost"
            disabled={isBusy}
            onClick={() => onProposeCancel(deal)}
            label={isBusy && busy?.kind === 'cancel-propose' ? 'Proposing…' : 'Propose cancellation'}
          />
        )}
      </div>

      {!canRefund && !canRelease && !canAcceptCancel && !canProposeCancel && (
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          No action available for your role on this deal state.
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function ActionButton({
  tone,
  onClick,
  disabled,
  label,
}: {
  tone: 'primary' | 'ghost';
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.08em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        tone === 'primary'
          ? 'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)]'
          : 'border border-black/20 text-[var(--lp-dark)] hover:bg-black/[0.04] hover:border-black/40',
      )}
      style={{
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 2,
      }}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-4 py-3"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {label}
      </p>
      <p className="mt-1 font-sans text-[20px] font-extrabold tabular-nums tracking-[-0.02em]">
        {value}
      </p>
    </div>
  );
}

function Note({
  tone,
  children,
}: {
  tone: 'info' | 'warn';
  children: React.ReactNode;
}) {
  const style =
    tone === 'warn'
      ? {
          background: 'rgba(178, 84, 37, 0.10)',
          color: '#b25425',
          border: '1px solid rgba(178, 84, 37, 0.35)',
        }
      : {
          background: 'var(--lp-light)',
          color: 'var(--lp-dark)',
          border: '1px solid var(--lp-border-light)',
        };
  return (
    <div
      className="px-4 py-3 text-[12.5px] leading-snug"
      style={{
        ...style,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      {children}
    </div>
  );
}
