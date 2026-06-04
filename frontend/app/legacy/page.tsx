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
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages/en';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  KARWAN_VAULT_LEGACY_ADDRESS,
  KARWAN_VAULT_LEGACY_ADDRESS_2,
  KARWAN_VAULT_LEGACY_ADDRESS_3,
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
  const lp = useTranslations().legacyPage;
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
        tag={lp.gate.tag}
        title={
          <>
            {lp.gate.titleBefore} <Accent>{lp.gate.titleAccent}</Accent> {lp.gate.titleAfter}
            <Punc>.</Punc>
          </>
        }
        body={<>{lp.gate.body}</>}
        buttonLabel={lp.gate.button}
      />
    );
  }

  if (windowState && !windowState.open) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[60ch]">
            <SectionTag tone="dark">{lp.closed.tag}</SectionTag>
            <HeroHeadline size="md">
              {lp.closed.title}<Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {lp.closed.body}
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
              {lp.closed.home}
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
            {lp.hero.tag}
          </SectionTag>
          <HeroHeadline size="md">
            {lp.hero.titleBefore} <Accent>{lp.hero.titleAccent}</Accent> {lp.hero.titleAfter}
            <Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[58ch]">
            {lp.hero.body}
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
              {lp.hero.windowClosesIn}
            </span>
            <span className="mono text-[14px] sm:text-[16px] font-extrabold text-white tabular-nums">
              {windowState?.closesAtMs ? <Countdown targetMs={windowState.closesAtMs} /> : '...'}
            </span>
          </div>
          <p className="mt-5 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] leading-relaxed">
            {lp.hero.afterWindowNote}
          </p>
        </div>
      </Band>

      <Band tone="light" compact>
        <SectionTag>{lp.stake.tag}</SectionTag>
        <HeroHeadline size="md">
          {lp.stake.title}<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[58ch]">
          {lp.stake.bodyBefore}{' '}
          <Link href="/stake" className="underline underline-offset-2">{lp.stake.stakeLink}</Link> {lp.stake.bodyAfter}
        </p>
        <div className="mt-8">
          <LegacyStakeCard address={address} isCircleUser={method === 'circle'} copy={lp} />
        </div>
      </Band>

      <Band tone="light" compact>
        <SectionTag>{lp.deals.tag}</SectionTag>
        <HeroHeadline size="md">
          {lp.deals.title}<Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--lp-text-sub)] max-w-[58ch]">
          {lp.deals.body}
        </p>
        <div className="mt-8">
          <LegacyDealsList address={address} copy={lp} />
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
  generation: 1 | 2 | 3;
}

function vaultAddressForGeneration(gen: 1 | 2 | 3): `0x${string}` | null {
  if (gen === 1) return KARWAN_VAULT_LEGACY_ADDRESS;
  if (gen === 2) return KARWAN_VAULT_LEGACY_ADDRESS_2;
  return KARWAN_VAULT_LEGACY_ADDRESS_3;
}

type StakeBusy = { kind: 'request' | 'cancel' | 'claim'; positionId: string } | null;

function LegacyStakeCard({
  address,
  isCircleUser,
  copy,
}: {
  address: string;
  isCircleUser: boolean;
  copy: Messages['legacyPage'];
}) {
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [positions, setPositions] = useState<LegacyPosition[]>([]);
  const [totalActive, setTotalActive] = useState('0');
  const [totalCooling, setTotalCooling] = useState('0');
  // Gen 1 was 7 days; Gen 2 + Gen 3 (v2.D vault) ship with 3 days. Each gen's
  // actual cooldown comes from the backend at fetch time; these are seeds for
  // pre-render before /api/legacy/vault answers.
  const [cooldownDaysByGen, setCooldownDaysByGen] = useState<Record<1 | 2 | 3, number>>({
    1: 7,
    2: 3,
    3: 3,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<StakeBusy>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{
    positionId: string;
    generation: 1 | 2 | 3;
    principal: string;
  } | null>(null);

  const onWrongChain = !isCircleUser && chainId !== ARC_CHAIN_ID;

  const refetch = useCallback(async () => {
    try {
      const r = await api.legacyVaultPositions(address);
      setPositions(r.positions);
      setTotalActive(r.totalActiveUsdc);
      setTotalCooling(r.totalCoolingUsdc);
      // Pre-seed both gens with the contract defaults, then overwrite with
      // whatever each configured gen actually reports. The contract was
      // bumped from 7 days (pre-v2.D) to 3 days (v2.D), so the right number
      // depends on which gen the position lives on.
      const map: Record<1 | 2 | 3, number> = { 1: 7, 2: 3, 3: 3 };
      for (const g of r.generations) {
        map[g.index] = g.cooldownDays;
      }
      setCooldownDaysByGen(map);
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
    async (
      kind: 'request' | 'cancel' | 'claim',
      positionId: string,
      actionGeneration: 1 | 2 | 3,
    ) => {
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
        const target = positions.find(
          (p) => p.positionId === positionId && p.generation === actionGeneration,
        );
        setPendingRequest({
          positionId,
          generation: actionGeneration,
          principal: target?.principalUsdc ?? '0',
        });
        return;
      }
      setBusy({ kind, positionId });
      try {
        const target = positions.find(
          (p) => p.positionId === positionId && p.generation === actionGeneration,
        );
        const generation = target?.generation ?? actionGeneration;
        const vaultAddrForAction = vaultAddressForGeneration(generation);
        if (isCircleUser) {
          const route =
            kind === 'cancel' ? api.legacyVaultCancelWithdraw : api.legacyVaultClaim;
          const r = await route({ address, positionId, generation });
          setLastTx(r.txHash);
        } else {
          if (!walletClient || !arcClient) throw new Error(copy.stake.errors.walletNotReady);
          if (!vaultAddrForAction) {
            throw new Error(copy.stake.errors.vaultNotConfiguredTemplate.replace('{generation}', String(generation)));
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
    [onWrongChain, switchChainAsync, isCircleUser, positions, walletClient, arcClient, address, refetch, copy],
  );

  const confirmRequest = useCallback(async () => {
    if (!pendingRequest) return;
    const positionId = pendingRequest.positionId;
    const generation = pendingRequest.generation;
    setPendingRequest(null);
    setLastError(null);
    setLastTx(null);
    setBusy({ kind: 'request', positionId });
    try {
      const vaultAddrForAction = vaultAddressForGeneration(generation);
      if (isCircleUser) {
        const r = await api.legacyVaultRequestWithdraw({ address, positionId, generation });
        setLastTx(r.txHash);
      } else {
        if (!walletClient || !arcClient) throw new Error(copy.stake.errors.walletNotReady);
        if (!vaultAddrForAction) {
          throw new Error(copy.stake.errors.vaultNotConfiguredTemplate.replace('{generation}', String(generation)));
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
  }, [pendingRequest, isCircleUser, walletClient, arcClient, address, refetch, copy]);

  if (loading) {
    return <div className="h-32 bg-black/[0.04] animate-pulse rounded-2xl" />;
  }

  if (positions.length === 0) {
    return (
      <Note tone="info">
        <span className="font-semibold">{copy.stake.empty.headline}</span> {copy.stake.empty.body}
      </Note>
    );
  }

  const active = positions.filter((p) => p.state === 'active');
  const cooling = positions.filter((p) => p.state === 'cooling');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat label={copy.stake.stats.active} value={`${formatUsdc(totalActive, { withSuffix: false })} USDC`} />
        <Stat label={copy.stake.stats.cooling} value={`${formatUsdc(totalCooling, { withSuffix: false })} USDC`} />
      </div>

      {onWrongChain && (
        <Note tone="warn">
          {copy.stake.wrongChain}
        </Note>
      )}

      {([1, 2, 3] as const).map((gen) => {
        const groupActive = active.filter((p) => p.generation === gen);
        if (groupActive.length === 0) return null;
        return (
          <PositionGroup
            key={`active-gen-${gen}`}
            title={copy.stake.groups.activeTitleTemplate.replace('{gen}', String(gen))}
            positions={groupActive}
            busy={busy}
            onAction={runAction}
            actionLabel={copy.stake.groups.startCooldownTemplate.replace('{days}', String(cooldownDaysByGen[gen]))}
            actionKind="request"
            signingLabel={copy.stake.groups.signing}
          />
        );
      })}

      {cooling.length > 0 && (
        <CoolingGroup positions={cooling} busy={busy} onAction={runAction} copy={copy} />
      )}

      {lastTx && (
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {copy.stake.txPrefix}{' '}
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
        title={copy.stake.confirmDialog.titleTemplate.replace('{principal}', pendingRequest?.principal ?? '')}
        body={
          <>
            {copy.stake.confirmDialog.bodyTemplate.replace(
              '{days}',
              String(pendingRequest ? cooldownDaysByGen[pendingRequest.generation] : 7),
            )}
          </>
        }
        confirmLabel={copy.stake.confirmDialog.confirm}
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
  signingLabel,
}: {
  title: string;
  positions: LegacyPosition[];
  busy: StakeBusy;
  onAction: (
    kind: 'request' | 'cancel' | 'claim',
    positionId: string,
    generation: 1 | 2 | 3,
  ) => void;
  actionLabel: string;
  actionKind: 'request';
  signingLabel: string;
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
                onClick={() => onAction(actionKind, p.positionId, p.generation)}
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
                {isBusy ? signingLabel : actionLabel}
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
  copy,
}: {
  positions: LegacyPosition[];
  busy: StakeBusy;
  onAction: (
    kind: 'request' | 'cancel' | 'claim',
    positionId: string,
    generation: 1 | 2 | 3,
  ) => void;
  copy: Messages['legacyPage'];
}) {
  return (
    <div className="space-y-2.5">
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
        {copy.stake.coolingTitle}
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
                  {claimable
                    ? copy.stake.claimReady
                    : copy.stake.claimInTemplate.replace('{days}', String(days)).replace('{hours}', String(hours))}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!claimable && (
                  <button
                    type="button"
                    onClick={() => onAction('cancel', p.positionId, p.generation)}
                    disabled={isBusy}
                    className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] hover:text-[var(--lp-dark)] underline underline-offset-2 disabled:opacity-50"
                  >
                    {copy.stake.cancelLink}
                  </button>
                )}
                {claimable && (
                  <button
                    type="button"
                    onClick={() => onAction('claim', p.positionId, p.generation)}
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
                    {isBusy ? copy.stake.claimingLabel : copy.stake.claimToWallet}
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
  generation: 1 | 2 | 3;
}

type DealBusy = { jobId: string; kind: 'refund' | 'release' | 'cancel-propose' | 'cancel-accept' } | null;

function LegacyDealsList({ address, copy }: { address: string; copy: Messages['legacyPage'] }) {
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
          if (!cleaned) throw new Error(copy.deals.errors.reasonRequired);
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
    [pendingAction, address, refetch, copy],
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
        <span className="font-semibold">{copy.deals.empty.headline}</span> {copy.deals.empty.body}
      </Note>
    );
  }

  return (
    <div className="space-y-6">
      {open.length === 0 ? (
        <Note tone="info">{copy.deals.noneOpen}</Note>
      ) : (
        <div className="space-y-2.5">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {copy.deals.openSectionTitle}
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
                copy={copy}
              />
            ))}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2.5">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
            {copy.deals.pastSectionTitle}
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
                    {(copy.deals.roles[deal.role] ?? deal.role)} · {(copy.deals.stateLabels[deal.stateLabel] ?? deal.stateLabel)}
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
          {copy.deals.txPrefix}{' '}
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
        title={dialogTitle(pendingAction?.kind, pendingAction?.deal, copy)}
        body={dialogBody(pendingAction?.kind, pendingAction?.deal, copy)}
        reasonPrompt={
          pendingAction?.kind === 'cancel-propose'
            ? {
                label: copy.deals.reasonPrompt.label,
                placeholder: copy.deals.reasonPrompt.placeholder,
                required: true,
              }
            : undefined
        }
        confirmLabel={dialogConfirmLabel(pendingAction?.kind, copy)}
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
  copy: Messages['legacyPage'],
): string {
  if (!kind || !deal) return '';
  if (kind === 'refund') return copy.deals.dialogs.refund.titleTemplate.replace('{amount}', deal.dealAmountUsdc);
  if (kind === 'release') return copy.deals.dialogs.release.titleTemplate.replace('{amount}', deal.dealAmountUsdc);
  if (kind === 'cancel-propose') return copy.deals.dialogs.cancelPropose.title;
  return copy.deals.dialogs.cancelAccept.title;
}

function dialogBody(
  kind: 'refund' | 'release' | 'cancel-propose' | 'cancel-accept' | undefined,
  deal: LegacyDeal | undefined,
  copy: Messages['legacyPage'],
): ReactNode {
  if (!kind || !deal) return null;
  if (kind === 'refund') {
    return <>{copy.deals.dialogs.refund.bodyTemplate.replace('{amount}', deal.dealAmountUsdc)}</>;
  }
  if (kind === 'release') {
    return <>{copy.deals.dialogs.release.bodyTemplate.replace('{amount}', deal.dealAmountUsdc)}</>;
  }
  if (kind === 'cancel-propose') {
    return <>{copy.deals.dialogs.cancelPropose.body}</>;
  }
  return <>{copy.deals.dialogs.cancelAccept.bodyTemplate.replace('{amount}', deal.dealAmountUsdc)}</>;
}

function dialogConfirmLabel(
  kind: 'refund' | 'release' | 'cancel-propose' | 'cancel-accept' | undefined,
  copy: Messages['legacyPage'],
): string {
  if (kind === 'refund') return copy.deals.dialogs.refund.confirm;
  if (kind === 'release') return copy.deals.dialogs.release.confirm;
  if (kind === 'cancel-propose') return copy.deals.dialogs.cancelPropose.confirm;
  if (kind === 'cancel-accept') return copy.deals.dialogs.cancelAccept.confirm;
  return copy.deals.dialogs.confirmFallback;
}

function DealRow({
  deal,
  busy,
  onRefund,
  onRelease,
  onProposeCancel,
  onAcceptCancel,
  copy,
}: {
  deal: LegacyDeal;
  busy: DealBusy;
  onRefund: (d: LegacyDeal) => void;
  onRelease: (d: LegacyDeal) => void;
  onProposeCancel: (d: LegacyDeal) => void;
  onAcceptCancel: (d: LegacyDeal) => void;
  copy: Messages['legacyPage'];
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
            [:{(copy.deals.roles[deal.role] ?? deal.role).toUpperCase()} · {(copy.deals.stateLabels[deal.stateLabel] ?? deal.stateLabel).toUpperCase()} · {copy.deals.row.genTemplate.replace('{n}', String(deal.generation))}:] {deal.jobId.slice(0, 10)}…{deal.jobId.slice(-6)}
          </p>
          <p className="mt-1.5 font-sans text-[22px] font-extrabold tabular-nums tracking-[-0.02em] leading-none">
            {formatUsdc(deal.dealAmountUsdc, { withSuffix: false })}{' '}
            <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] font-normal">
              USDC
            </span>
          </p>
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {deal.pastDeadline ? copy.deals.row.pastDeadline : copy.deals.row.live} · {deal.delivered ? copy.deals.row.delivered : copy.deals.row.notDelivered}
        </span>
      </div>

      {deal.hasCancellationProposal && deal.cancellationProposal && (
        <p className="text-[12.5px] leading-snug text-[var(--lp-dark)]">
          <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] me-2">
            {copy.deals.row.cancelProposedByTemplate.replace(
              '{role}',
              copy.deals.roles[deal.cancellationProposal.proposedBy] ?? deal.cancellationProposal.proposedBy,
            )}
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
            label={isBusy && busy?.kind === 'refund' ? copy.deals.actions.refunding : copy.deals.actions.refundToBuyer}
          />
        )}
        {canRelease && (
          <ActionButton
            tone="primary"
            disabled={isBusy}
            onClick={() => onRelease(deal)}
            label={isBusy && busy?.kind === 'release' ? copy.deals.actions.releasing : copy.deals.actions.releaseToSeller}
          />
        )}
        {canAcceptCancel && (
          <ActionButton
            tone="primary"
            disabled={isBusy}
            onClick={() => onAcceptCancel(deal)}
            label={isBusy && busy?.kind === 'cancel-accept' ? copy.deals.actions.accepting : copy.deals.actions.acceptCancellation}
          />
        )}
        {canProposeCancel && (
          <ActionButton
            tone="ghost"
            disabled={isBusy}
            onClick={() => onProposeCancel(deal)}
            label={isBusy && busy?.kind === 'cancel-propose' ? copy.deals.actions.proposing : copy.deals.actions.proposeCancellation}
          />
        )}
      </div>

      {!canRefund && !canRelease && !canAcceptCancel && !canProposeCancel && (
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
          {copy.deals.row.noAction}
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
