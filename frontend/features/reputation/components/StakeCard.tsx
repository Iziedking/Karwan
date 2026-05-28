'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBalance, useWalletClient, usePublicClient, useChainId, useSwitchChain } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useReputation } from '../hooks/useReputation';
import { cn } from '@/shared/utils/cn';
import { formatUsdc } from '@/shared/utils/format';
import { PageTour } from '@/shared/guide/PageTour';
import { useGuide } from '@/shared/guide/GuideProvider';
import { STAKE_TOUR_ID, STAKE_STEPS } from '@/shared/guide/tours';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
  KARWAN_VAULT_ADDRESS,
} from '../../profile/config';

/// SKILL-grade staking surface. Reads positions from /api/vault/positions
/// every 10s while open; supports deposit + request-withdraw + cancel-
/// withdraw + claim. Web3 users sign via wagmi `writeContract`; Circle
/// users route through the backend's identity DCW so no wallet popup
/// is required.

type ActionKind = 'deposit' | 'request' | 'cancel' | 'claim';

interface ActionLog {
  id: string;
  kind: ActionKind;
  positionId?: string;
  amountUsdc?: string;
  txHash?: string;
  status: 'pending' | 'done' | 'failed';
  error?: string;
}

const usdcAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const vaultAbi = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
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

const TIER_TONE: Record<
  'NEW' | 'COLD' | 'ESTABLISHED' | 'STRONG' | 'ELITE',
  { color: string; bg: string; border: string }
> = {
  NEW: {
    color: 'var(--color-ink-faint)',
    bg: 'var(--color-surface-2)',
    border: 'var(--color-line)',
  },
  COLD: {
    color: 'var(--color-warning)',
    bg: 'var(--color-warning-soft)',
    border: 'color-mix(in oklab, var(--color-warning) 28%, transparent)',
  },
  ESTABLISHED: {
    color: 'var(--color-accent)',
    bg: 'var(--color-accent-soft)',
    border: 'color-mix(in oklab, var(--color-accent) 28%, transparent)',
  },
  STRONG: {
    color: 'var(--color-positive)',
    bg: 'var(--color-positive-soft)',
    border: 'color-mix(in oklab, var(--color-positive) 28%, transparent)',
  },
  ELITE: {
    color: '#0E5E3E',
    bg: 'color-mix(in oklab, #0E5E3E 8%, transparent)',
    border: 'color-mix(in oklab, #0E5E3E 30%, transparent)',
  },
};

/// `tour` controls whether this card runs its own guided tour. The standalone
/// /stake page leaves it on; when embedded in /profile it's turned off so the
/// Profile tour (which already mentions staking) doesn't collide with it.
export function StakeCard({ tour = true }: { tour?: boolean }) {
  const auth = useAuth();
  const address = auth.address as `0x${string}` | undefined;
  const isCircleUser = auth.method === 'circle';
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { recordAction } = useGuide();
  // Web3 users sign vault txs from their own wallet. If that wallet is on the
  // wrong network (e.g. Base), the deposit/withdraw/claim would broadcast on
  // the wrong chain. Detect it and make the user switch to Arc first. Circle
  // users sign through the backend DCW, so the wallet chain is irrelevant.
  const onWrongChain = !isCircleUser && !!address && chainId !== ARC_CHAIN_ID;
  const { data: rep, refetch: refetchRep } = useReputation(address);

  const switchToArc = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: ARC_CHAIN_ID });
    } catch {
      // user declined the wallet prompt; the banner stays so they can retry
    }
  }, [switchChainAsync]);

  const [positions, setPositions] = useState<
    Array<{
      positionId: string;
      principalUsdc: string;
      depositedAt: number;
      claimableAt: number;
      state: 'active' | 'cooling' | 'claimed';
      tenureDays: number;
    }>
  >([]);
  const [totalActive, setTotalActive] = useState('0');
  /// False while the backend is still walking the vault's event log for this
  /// owner. Drives the "syncing" pill so the user doesn't take a mid-scan
  /// total as final.
  const [synced, setSynced] = useState(true);
  const [totalCooling, setTotalCooling] = useState('0');
  /// v2.D insurance: amount of active stake locked against open deals.
  /// Cannot be cooled until the related deal settles or refunds. Absent on
  /// pre-v2.D backends; treated as '0' there.
  const [reservedUsdc, setReservedUsdc] = useState('0');
  /// v2.D: totalActive minus reservedUsdc. The portion the user can cool
  /// down or use to accept new deals.
  const [freeStakeUsdc, setFreeStakeUsdc] = useState('0');
  const [cooldownDays, setCooldownDays] = useState(7);
  const [vaultDeployed, setVaultDeployed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [depositAmount, setDepositAmount] = useState<number | ''>('');
  const [withdrawAmount, setWithdrawAmount] = useState<number | ''>('');
  const [log, setLog] = useState<ActionLog[]>([]);
  const [busyKind, setBusyKind] = useState<{ kind: ActionKind; positionId?: string } | null>(null);

  // Pending-withdrawal confirmation. We never call the native `window.confirm`
  // here; the dialog is rendered in-card as a state-driven banner so users
  // stay inside the product surface. When set, the form shows the "Cool X USDC?
  // Confirm / Cancel" pair; on confirm we execute, on cancel we clear.
  const [pendingWithdraw, setPendingWithdraw] = useState<{
    requested: number;
    coolingTotal: number;
    toCool: Array<{ positionId: string; principalUsdc: string }>;
  } | null>(null);

  // Wallet USDC balance, shown as MAX on the deposit input. Arc Testnet uses
  // USDC as the native gas asset (18 decimals), so a native balance read is
  // the dollar value. Used purely for display and the MAX click; the actual
  // deposit call still parses to 6-decimal ERC-20 units inside `submitDeposit`.
  const walletBalance = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: ARC_CHAIN_ID,
  });
  const walletUsdc = useMemo(() => {
    if (!walletBalance.data) return null;
    return Number(formatUnits(walletBalance.data.value, walletBalance.data.decimals));
  }, [walletBalance.data]);

  // Block a deposit larger than the wallet holds before it ever reaches the
  // wallet. Without this the approve succeeds and `vault.deposit` reverts, so
  // the only error the user sees is a raw wallet failure with no explanation.
  const depositExceedsBalance =
    typeof depositAmount === 'number' && walletUsdc != null && depositAmount > walletUsdc;

  // Same gate on the withdraw side: you can only cool the FREE portion of
  // active stake. Reserved stake (locked against open deal insurance) is
  // refused by the contract via ReservationLocked. Pre-v2.D backends omit
  // freeStakeUsdc so it falls back to totalActive — same behaviour as
  // before. Naming kept as -Active for diff stability across uses below.
  const withdrawExceedsActive =
    typeof withdrawAmount === 'number' && withdrawAmount > Number(freeStakeUsdc);

  const refetchPositions = useCallback(async () => {
    if (!address) return;
    try {
      const r = await api.vaultPositions(address);
      setPositions(r.positions);
      setTotalActive(r.totalActiveUsdc);
      setTotalCooling(r.totalCoolingUsdc);
      // v2.D reservation fields. Pre-v2.D backends omit them; fall back to
      // zero reservation, free = active so the UI stays correct.
      setReservedUsdc(r.reservedUsdc ?? '0');
      setFreeStakeUsdc(r.freeStakeUsdc ?? r.totalActiveUsdc);
      setCooldownDays(r.cooldownDays);
      setVaultDeployed(r.vaultAddress != null);
      // synced is optional for back-compat with older backends.
      setSynced(r.synced !== false);
    } catch {
      // Silent — UI shows "could not load" if it stays empty.
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setPositions([]);
      setLoading(false);
      return;
    }
    refetchPositions();
    const id = setInterval(refetchPositions, 10_000);
    return () => clearInterval(id);
  }, [address, refetchPositions]);

  const pushLog = useCallback((entry: Omit<ActionLog, 'id'>) => {
    const id = `${entry.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setLog((prev) => [{ id, ...entry }, ...prev].slice(0, 6));
    return id;
  }, []);

  const patchLog = useCallback((id: string, patch: Partial<ActionLog>) => {
    setLog((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  // -------------------- deposit --------------------

  const submitDeposit = useCallback(async () => {
    if (!address) return;
    if (typeof depositAmount !== 'number' || depositAmount <= 0) return;
    // Balance precheck. Surface "insufficient balance" instead of letting the
    // approve pass and the deposit revert in the wallet with no explanation.
    if (walletUsdc != null && depositAmount > walletUsdc) {
      pushLog({
        kind: 'deposit',
        amountUsdc: depositAmount.toString(),
        status: 'failed',
        error: `Insufficient balance. You have ${walletUsdc.toFixed(2)} USDC.`,
      });
      return;
    }
    // Wrong network: prompt the switch and stop. The user re-clicks once their
    // wallet is on Arc, so we never sign against the wrong chain.
    if (!isCircleUser && chainId !== ARC_CHAIN_ID) {
      await switchToArc();
      return;
    }
    const amountUsdc = depositAmount;
    const amountWei = parseUnits(amountUsdc.toString(), ARC_USDC_DECIMALS);

    setBusyKind({ kind: 'deposit' });
    const logId = pushLog({
      kind: 'deposit',
      amountUsdc: amountUsdc.toString(),
      status: 'pending',
    });

    try {
      if (isCircleUser) {
        const r = await api.vaultDeposit({ address, amountUsdc });
        patchLog(logId, { status: 'done', txHash: r.depositTxHash });
      } else {
        if (!walletClient || !arcClient) throw new Error('Wallet not ready. Reconnect and retry.');
        // Allowance precheck.
        const current = (await arcClient.readContract({
          address: ARC_USDC_ADDRESS,
          abi: usdcAbi,
          functionName: 'allowance',
          args: [address, KARWAN_VAULT_ADDRESS],
        })) as bigint;
        if (current < amountWei) {
          const approveHash = await walletClient.writeContract({
            address: ARC_USDC_ADDRESS,
            abi: usdcAbi,
            functionName: 'approve',
            args: [KARWAN_VAULT_ADDRESS, amountWei],
            chain: walletClient.chain,
            account: address,
          });
          await arcClient.waitForTransactionReceipt({ hash: approveHash });
        }
        const depositHash = await walletClient.writeContract({
          address: KARWAN_VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: 'deposit',
          args: [amountWei],
          chain: walletClient.chain,
          account: address,
        });
        await arcClient.waitForTransactionReceipt({ hash: depositHash });
        patchLog(logId, { status: 'done', txHash: depositHash });
      }
      recordAction('stake-deposit');
      await refetchPositions();
      await refetchRep();
    } catch (err) {
      patchLog(logId, { status: 'failed', error: (err as Error).message });
    } finally {
      setBusyKind(null);
    }
  }, [address, depositAmount, walletUsdc, isCircleUser, chainId, switchToArc, recordAction, walletClient, arcClient, refetchPositions, refetchRep, pushLog, patchLog]);

  // -------------------- withdraw --------------------

  /// Cools whole positions (newest-first, LIFO so tenure damage is minimised)
  /// until their principal sum covers the requested amount. The KarwanVault
  /// contract today only supports per-position cool-down (no partial split),
  /// so on testnet the final cooled amount is the smallest position-boundary
  /// at or above the user's request. The confirm dialog states the exact
  /// figure before the chain calls fire. Mainnet partial withdrawal lives in
  /// todo.md §3 (USYC routing) and removes this rounding.
  const submitWithdraw = useCallback(() => {
    if (!address) return;
    if (typeof withdrawAmount !== 'number' || withdrawAmount <= 0) return;
    const active = positions.filter((p) => p.state === 'active');
    if (active.length === 0) return;
    // Can't cool more than is free. Reserved stake is locked against open
    // deals and the contract refuses to cool it (ReservationLocked).
    if (withdrawAmount > Number(freeStakeUsdc)) {
      pushLog({
        kind: 'request',
        amountUsdc: withdrawAmount.toString(),
        status: 'failed',
        error:
          Number(reservedUsdc) > 0
            ? `Insufficient free stake. You have ${formatUsdc(freeStakeUsdc, { withSuffix: false })} USDC free, ${formatUsdc(reservedUsdc, { withSuffix: false })} USDC reserved against open deals.`
            : `Insufficient stake. You have ${formatUsdc(freeStakeUsdc, { withSuffix: false })} USDC active.`,
      });
      return;
    }

    // Position-selection algorithm. The contract cools whole positions, so
    // we pick the set that gives the user what they typed with the least
    // over-cooling:
    //   1. exact single-position match → cool just that one
    //   2. smallest single position that covers the request → minimises overshoot
    //   3. only if no single position is big enough, sum newest-first
    const EPS = 0.000_001;
    let toCool: typeof active;

    const exact = active.find(
      (p) => Math.abs(Number(p.principalUsdc) - withdrawAmount) < EPS,
    );
    if (exact) {
      toCool = [exact];
    } else {
      const covering = active
        .filter((p) => Number(p.principalUsdc) >= withdrawAmount - EPS)
        .sort((a, b) => Number(a.principalUsdc) - Number(b.principalUsdc));
      if (covering.length > 0) {
        toCool = [covering[0]];
      } else {
        // Need to combine positions. Sort newest-first so we sacrifice the
        // youngest tenure first.
        const sortedNewestFirst = [...active].sort(
          (a, b) => Number(b.positionId) - Number(a.positionId),
        );
        toCool = [];
        let sum = 0;
        for (const p of sortedNewestFirst) {
          if (sum >= withdrawAmount - EPS) break;
          toCool.push(p);
          sum += Number(p.principalUsdc);
        }
      }
    }

    const coolingTotal = toCool.reduce((acc, p) => acc + Number(p.principalUsdc), 0);
    if (toCool.length === 0) return;

    // Park the selection in state; the inline banner renders confirm + cancel
    // buttons below the form. No native confirm() so the UI stays editorial.
    setPendingWithdraw({
      requested: withdrawAmount,
      coolingTotal,
      toCool: toCool.map((p) => ({ positionId: p.positionId, principalUsdc: p.principalUsdc })),
    });
  }, [address, withdrawAmount, positions, freeStakeUsdc, reservedUsdc, pushLog]);

  const confirmWithdraw = useCallback(async () => {
    if (!pendingWithdraw || !address) return;
    if (!isCircleUser && chainId !== ARC_CHAIN_ID) {
      await switchToArc();
      return;
    }
    const { toCool } = pendingWithdraw;
    setPendingWithdraw(null);
    setBusyKind({ kind: 'request' });
    for (const p of toCool) {
      const logId = pushLog({
        kind: 'request',
        positionId: p.positionId,
        amountUsdc: p.principalUsdc,
        status: 'pending',
      });
      try {
        if (isCircleUser) {
          const r = await api.vaultRequestWithdraw({ address, positionId: p.positionId });
          patchLog(logId, { status: 'done', txHash: r.txHash });
        } else {
          if (!walletClient || !arcClient) throw new Error('Wallet not ready. Reconnect and retry.');
          const hash = await walletClient.writeContract({
            address: KARWAN_VAULT_ADDRESS,
            abi: vaultAbi,
            functionName: 'requestWithdraw',
            args: [BigInt(p.positionId)],
            chain: walletClient.chain,
            account: address,
          });
          await arcClient.waitForTransactionReceipt({ hash });
          patchLog(logId, { status: 'done', txHash: hash });
        }
      } catch (err) {
        patchLog(logId, { status: 'failed', error: (err as Error).message });
        // Don't continue cooling more positions after a failure; the user
        // can re-try with the remaining amount.
        break;
      }
    }
    setBusyKind(null);
    setWithdrawAmount('');
    await refetchPositions();
    await refetchRep();
  }, [
    address,
    pendingWithdraw,
    isCircleUser,
    chainId,
    switchToArc,
    walletClient,
    arcClient,
    refetchPositions,
    refetchRep,
    pushLog,
    patchLog,
  ]);

  const cancelPendingWithdraw = useCallback(() => setPendingWithdraw(null), []);

  // -------------------- position actions --------------------

  const positionAction = useCallback(
    async (kind: 'request' | 'cancel' | 'claim', positionId: string) => {
      if (!address) return;
      if (!isCircleUser && chainId !== ARC_CHAIN_ID) {
        await switchToArc();
        return;
      }
      // Withdrawal is the only destructive action on a position. Guard it
      // behind an explicit confirm so an accidental click doesn't kick off
      // the cool-down (3 days on v2.D, was 7 on pre-v2.D). cancel + claim
      // are reversible / terminal, no need to confirm.
      if (kind === 'request') {
        const ok = window.confirm(
          `Start the ${cooldownDays}-day withdrawal cool-down on position #${positionId}? Stake stops earning reputation until you cancel or claim.`,
        );
        if (!ok) return;
      }
      setBusyKind({ kind, positionId });
      const logId = pushLog({ kind, positionId, status: 'pending' });

      try {
        if (isCircleUser) {
          const route =
            kind === 'request'
              ? api.vaultRequestWithdraw
              : kind === 'cancel'
                ? api.vaultCancelWithdraw
                : api.vaultClaim;
          const r = await route({ address, positionId });
          patchLog(logId, { status: 'done', txHash: r.txHash });
        } else {
          if (!walletClient || !arcClient) throw new Error('Wallet not ready. Reconnect and retry.');
          const fnName =
            kind === 'request' ? 'requestWithdraw' : kind === 'cancel' ? 'cancelWithdraw' : 'claim';
          const hash = await walletClient.writeContract({
            address: KARWAN_VAULT_ADDRESS,
            abi: vaultAbi,
            functionName: fnName,
            args: [BigInt(positionId)],
            chain: walletClient.chain,
            account: address,
          });
          await arcClient.waitForTransactionReceipt({ hash });
          patchLog(logId, { status: 'done', txHash: hash });
        }
        await refetchPositions();
        await refetchRep();
      } catch (err) {
        patchLog(logId, { status: 'failed', error: (err as Error).message });
      } finally {
        setBusyKind(null);
      }
    },
    [address, isCircleUser, chainId, switchToArc, walletClient, arcClient, refetchPositions, refetchRep, pushLog, patchLog, cooldownDays],
  );

  // -------------------- derived --------------------

  const tier = rep?.tier as keyof typeof TIER_TONE | undefined;
  const tone = tier ? TIER_TONE[tier] : TIER_TONE.NEW;

  const stakeBoost = useMemo(() => {
    const term = rep?.terms?.stake;
    if (typeof term !== 'number') return null;
    return Math.max(0, term - 1);
  }, [rep]);

  // -------------------- render --------------------

  if (!address) {
    return (
      <div style={CARD_STYLE} className="px-6 py-8">
        <SectionEyebrow>STAKE</SectionEyebrow>
        <p className="mt-3 text-[14px] text-[var(--lp-text-sub)] max-w-[48ch] leading-relaxed">
          Sign in to deposit USDC into KarwanVault. Stake earns reputation; the
          score grows your tier and softens the agent loop in your favor.
        </p>
      </div>
    );
  }

  return (
    <div style={CARD_STYLE} className="px-6 py-7 space-y-7">
      {tour && <PageTour id={STAKE_TOUR_ID} steps={STAKE_STEPS} />}
      {/* HEADER — v2.D three-way split: Active total prominent, then a
          smaller meta line breaking it into Free / Reserved (open deal
          insurance) / Cooling. Reserved only renders when > 0 so users
          who haven't accepted any deals see the familiar pre-v2.D shape. */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="space-y-2 min-w-0" data-guide="stake-total">
          <SectionEyebrow>STAKE</SectionEyebrow>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="font-sans text-[32px] font-extrabold tabular-nums tracking-[-0.02em] leading-none text-[var(--lp-dark)]"
            >
              {formatUsdc(totalActive, { withSuffix: false })}
            </span>
            <span className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              USDC ACTIVE
            </span>
            {!synced && (
              <span
                className="mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full"
                style={{
                  color: 'var(--lp-text-muted)',
                  background: 'var(--lp-surface-2, rgba(0,0,0,0.05))',
                }}
                title="Scanning chain history. The total may still rise."
              >
                syncing
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            <span>
              FREE {formatUsdc(freeStakeUsdc, { withSuffix: false })}
            </span>
            {Number(reservedUsdc) > 0 && (
              <>
                <span aria-hidden>·</span>
                <span
                  title="Locked against an active deal as buyer-side insurance. Releases on settle, slashes to the buyer on a dispute you lose."
                >
                  RESERVED {formatUsdc(reservedUsdc, { withSuffix: false })}
                </span>
              </>
            )}
            {Number(totalCooling) > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>
                  COOLING {formatUsdc(totalCooling, { withSuffix: false })}
                </span>
              </>
            )}
          </div>
        </div>
        {tier && (
          <div
            className="inline-flex items-stretch border"
            style={{ borderColor: tone.border, borderRadius: 3 }}
          >
            <span aria-hidden className="w-[3px]" style={{ background: tone.color }} />
            <span
              className="px-2.5 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: tone.color, background: tone.bg }}
            >
              {tier}
            </span>
            {rep?.score != null && (
              <span
                className="px-2.5 py-1.5 mono text-[11px] tabular-nums"
                style={{ color: 'var(--color-ink-dim)', background: 'var(--lp-light)' }}
              >
                {rep.score}/1000
              </span>
            )}
          </div>
        )}
      </div>

      {/* WRONG NETWORK. Web3 users only: prompt to switch before any signing
          so a stake never broadcasts on the wallet's current (wrong) chain. */}
      {onWrongChain && (
        <div
          className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{
            background: 'rgba(178, 84, 37, 0.10)',
            border: '1px solid rgba(178, 84, 37, 0.35)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          <div className="min-w-0">
            <p
              className="mono text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{ color: '#b25425' }}
            >
              [:WRONG NETWORK:]
            </p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--lp-dark)]">
              Your wallet is on another network. Switch to Arc Testnet to stake.
            </p>
          </div>
          <button
            type="button"
            onClick={switchToArc}
            className="shrink-0 mono text-[11px] font-bold uppercase tracking-[0.08em] px-4 py-2 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
            style={{
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 2,
            }}
          >
            Switch to Arc
          </button>
        </div>
      )}

      {/* VAULT NOT DEPLOYED STATE */}
      {vaultDeployed === false && (
        <Note tone="info">
          KarwanVault is not deployed on this environment. Set
          {' '}<code className="mono text-[11px]">KARWAN_VAULT_ADDR</code> in <code className="mono text-[11px]">.env</code> and
          restart the backend.
        </Note>
      )}

      {/* USYC YIELD NARRATIVE.
          On testnet the vault holds plain USDC. On mainnet, KarwanVault routes
          idle stake through Hashnote USYC so the same deposit earns yield
          while it builds reputation. Treasury fees walk the same path. */}
      <YieldNote />


      {/* DEPOSIT + WITHDRAW. side-by-side on md+, stacked on mobile. The
          deposit input drives `vault.deposit`. The withdraw input drives a
          cool-down on whole positions (newest-first) until the requested
          amount is covered. Withdraw is disabled when there is no active
          stake. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* DEPOSIT */}
        <div className="space-y-3" data-guide="stake-deposit">
          <div className="flex items-baseline justify-between gap-2">
            <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              DEPOSIT
            </span>
            <button
              type="button"
              onClick={() => walletUsdc != null && setDepositAmount(Math.floor(walletUsdc * 100) / 100)}
              disabled={walletUsdc == null || walletUsdc <= 0}
              title={walletUsdc != null ? `Wallet balance: ${walletUsdc.toFixed(2)} USDC. Click to fill.` : 'Loading wallet balance…'}
              className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] tabular-nums hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-sm px-0.5 transition-colors disabled:cursor-not-allowed disabled:hover:text-[var(--lp-text-muted)]"
            >
              MAX {walletUsdc != null ? walletUsdc.toFixed(2) : '-'}
            </button>
          </div>
          <div className="flex items-stretch gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={depositAmount}
              onChange={(e) =>
                setDepositAmount(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={busyKind?.kind === 'deposit'}
              placeholder="0"
              className="form-input form-input-num flex-1 min-w-0"
              aria-label="Deposit amount in USDC"
            />
            <button
              type="button"
              onClick={submitDeposit}
              disabled={
                busyKind?.kind === 'deposit' ||
                !depositAmount ||
                depositExceedsBalance ||
                vaultDeployed === false ||
                onWrongChain
              }
              className={cn(
                'inline-flex items-center gap-2 px-5 py-3 mono text-[12px] font-bold uppercase tracking-[0.08em] shrink-0 transition-[transform,box-shadow] duration-150',
                'bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0',
                'shadow-[0_3px_0_rgba(0,0,0,0.22)] hover:shadow-[0_4px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)]',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0',
              )}
              style={{
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              {busyKind?.kind === 'deposit' ? 'Depositing…' : 'Deposit'}
              <span aria-hidden>↘</span>
            </button>
          </div>
          {depositExceedsBalance && (
            <p className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#b25425' }}>
              Insufficient balance. You have {walletUsdc?.toFixed(2)} USDC.
            </p>
          )}
        </div>

        {/* WITHDRAW */}
        <div className="space-y-3" data-guide="stake-withdraw">
          <div className="flex items-baseline justify-between gap-2">
            <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              WITHDRAW
            </span>
            <button
              type="button"
              onClick={() => Number(freeStakeUsdc) > 0 && setWithdrawAmount(Number(freeStakeUsdc))}
              disabled={Number(freeStakeUsdc) <= 0}
              title={
                Number(freeStakeUsdc) > 0
                  ? `Free stake: ${formatUsdc(freeStakeUsdc, { withSuffix: false })} USDC. Click to fill. (Reserved stake stays locked until the deal settles.)`
                  : Number(reservedUsdc) > 0
                    ? 'All your active stake is reserved against open deals. It unlocks when those deals settle.'
                    : 'No active stake to withdraw'
              }
              className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] tabular-nums hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-sm px-0.5 transition-colors disabled:cursor-not-allowed disabled:hover:text-[var(--lp-text-muted)]"
            >
              MAX {formatUsdc(freeStakeUsdc, { withSuffix: false })}
            </button>
          </div>
          <div className="flex items-stretch gap-2">
            <input
              type="number"
              min={1}
              step={1}
              max={Number(freeStakeUsdc) || undefined}
              value={withdrawAmount}
              onChange={(e) =>
                setWithdrawAmount(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={busyKind?.kind === 'request' || Number(freeStakeUsdc) <= 0}
              placeholder="0"
              className="form-input form-input-num flex-1 min-w-0"
              aria-label="Withdraw amount in USDC"
            />
            <button
              type="button"
              onClick={submitWithdraw}
              disabled={
                busyKind?.kind === 'request' ||
                !withdrawAmount ||
                withdrawExceedsActive ||
                Number(freeStakeUsdc) <= 0 ||
                vaultDeployed === false ||
                onWrongChain
              }
              className={cn(
                'inline-flex items-center gap-2 px-5 py-3 mono text-[12px] font-bold uppercase tracking-[0.08em] shrink-0 transition-colors',
                'border border-black/20 text-[var(--lp-dark)] hover:bg-black/[0.04] hover:border-black/40',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              style={{
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              {busyKind?.kind === 'request' ? 'Cooling…' : 'Withdraw'}
              <span aria-hidden>↗</span>
            </button>
          </div>
          {withdrawExceedsActive && (
            <p className="mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#b25425' }}>
              {Number(reservedUsdc) > 0
                ? `Insufficient free stake. You have ${formatUsdc(freeStakeUsdc, { withSuffix: false })} USDC free (${formatUsdc(reservedUsdc, { withSuffix: false })} USDC reserved against open deals).`
                : `Insufficient stake. You have ${formatUsdc(freeStakeUsdc, { withSuffix: false })} USDC active.`}
            </p>
          )}
        </div>
      </div>

      {/* IN-UI WITHDRAWAL CONFIRMATION.
          Rendered when submitWithdraw has parked a pending request in state.
          Replaces the previous native window.confirm(). Lime-tinted card with
          the precise amount about to be cooled, the rounding caveat if any,
          and confirm/cancel buttons that stay inside the product surface. */}
      {pendingWithdraw && (
        <div
          className="-mt-2 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{
            background:
              'linear-gradient(120deg, color-mix(in oklab, var(--lp-accent) 14%, transparent), color-mix(in oklab, var(--lp-accent) 4%, transparent))',
            border: '1px solid color-mix(in oklab, var(--lp-accent) 35%, transparent)',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 3,
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--lp-band-dark)]">
              [:CONFIRM WITHDRAWAL:]
            </p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--lp-dark)]">
              Cool <span className="font-bold tabular-nums">{pendingWithdraw.coolingTotal} USDC</span> for <span className="font-bold">{cooldownDays} days</span>.
            </p>
            {pendingWithdraw.coolingTotal > pendingWithdraw.requested + 0.000_001 && (
              <p className="mt-1 text-[12px] leading-snug" style={{ color: '#b25425' }}>
                Rounded up from your <span className="tabular-nums">{pendingWithdraw.requested}</span> USDC request. The vault cools whole positions only, and your smallest matching position is {pendingWithdraw.toCool.length === 1 ? `#${pendingWithdraw.toCool[0].positionId} (${pendingWithdraw.toCool[0].principalUsdc} USDC)` : `${pendingWithdraw.toCool.length} positions`}. To cool less, deposit smaller amounts next time.
              </p>
            )}
            <p className="mt-1 text-[12px] leading-snug text-[var(--lp-text-sub)]">
              This stake stops earning reputation during the cool-down. Cancel anytime in the {cooldownDays}-day window to resume earning with tenure intact.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={cancelPendingWithdraw}
              className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-black/[0.04] transition-colors"
              style={{
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 2,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmWithdraw}
              className="px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.12em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors"
              style={{
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 2,
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] leading-relaxed -mt-2">
        Withdrawal starts a {cooldownDays}-day cool-down. After that the stake is claimable to your wallet.
      </p>

      {/* COOLING.
          Only cooling positions render here. Active stake is shown as the
          single number at the top. Per-user request: no resume / cancel
          button. Once a withdrawal is started it sits in cool-down until the
          7 days elapse, then the Claim button appears. */}
      <CoolingList
        positions={positions}
        loading={loading}
        vaultDeployed={vaultDeployed === false}
        busyKind={busyKind}
        onClaim={(positionId) => positionAction('claim', positionId)}
        onCancel={(positionId) => positionAction('cancel', positionId)}
      />

      {/* RECENT ACTIVITY */}
      {log.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            RECENT
          </span>
          <ul className="space-y-1.5">
            {log.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 mono text-[11px] text-[var(--lp-text-sub)]"
              >
                <span className="uppercase tracking-[0.1em] text-[var(--lp-text-muted)]">
                  {entry.kind}
                  {entry.positionId ? ` #${entry.positionId}` : ''}
                  {entry.amountUsdc ? ` · ${entry.amountUsdc} USDC` : ''}
                </span>
                <span
                  className="tabular-nums"
                  style={{
                    color:
                      entry.status === 'failed'
                        ? '#7a1f1a'
                        : entry.status === 'done'
                          ? 'var(--color-positive)'
                          : 'var(--color-ink-dim)',
                  }}
                >
                  {entry.status === 'pending' && '…'}
                  {entry.status === 'done' && entry.txHash && (
                    <a
                      href={ARC_EXPLORER_TX(entry.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {entry.txHash.slice(0, 6)}…{entry.txHash.slice(-4)} ↗
                    </a>
                  )}
                  {entry.status === 'failed' && (entry.error?.slice(0, 40) ?? 'failed')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-text-muted)]">
      [:{children}:]
    </span>
  );
}

function StatePill({ state }: { state: 'active' | 'cooling' | 'claimed' }) {
  const tone =
    state === 'active'
      ? { color: 'var(--color-positive)', bg: 'var(--color-positive-soft)' }
      : state === 'cooling'
        ? { color: 'var(--color-warning)', bg: 'var(--color-warning-soft)' }
        : { color: 'var(--color-ink-faint)', bg: 'var(--color-surface-2)' };
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-[2px] mono text-[9px] font-bold uppercase tracking-[0.14em]"
      style={{ color: tone.color, background: tone.bg, borderRadius: 3 }}
    >
      <span
        aria-hidden
        className="inline-block w-[5px] h-[5px]"
        style={{ background: tone.color, borderRadius: 1 }}
      />
      {state}
    </span>
  );
}

function CountdownLabel({ claimableAt }: { claimableAt: number }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);
  const delta = claimableAt - now;
  if (delta <= 0) return <span style={{ color: 'var(--color-positive)' }}>claim ready</span>;
  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  if (days > 0) return <span>claim in {days}d {hours}h</span>;
  const mins = Math.floor((delta % 3600) / 60);
  return <span>claim in {hours}h {mins}m</span>;
}

/// Renders the user's cooling positions as a list. Active stake is shown as
/// a single aggregate number at the top of the card, so this list is only
/// for stake that is winding down. Each cooling row shows the principal,
/// the countdown to claim, and a Claim button once the cool-down elapses.
/// No resume / cancel button: per user UX direction, withdrawals are a
/// one-way path. (The /api/vault/cancel-withdraw route still exists for
/// terminal recovery via curl if a deposit is cooled by mistake.)
function CoolingList({
  positions,
  loading,
  vaultDeployed,
  busyKind,
  onClaim,
  onCancel,
}: {
  positions: Array<{
    positionId: string;
    principalUsdc: string;
    claimableAt: number;
    state: 'active' | 'cooling' | 'claimed';
  }>;
  loading: boolean;
  vaultDeployed: boolean;
  busyKind: { kind: ActionKind; positionId?: string } | null;
  onClaim: (positionId: string) => void;
  /// Quiet escape hatch for accidental withdrawal clicks. Rendered as a
  /// small mono text-link on cooling rows, not a primary button — keeps the
  /// "one-way withdrawal flow" intent while letting users undo a mistake.
  onCancel: (positionId: string) => void;
}) {
  const cooling = positions.filter((p) => p.state === 'cooling');

  if (loading) {
    return (
      <div className="space-y-2">
        <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
          COOLING
        </span>
        <div className="h-14 bg-black/[0.05] animate-pulse motion-reduce:animate-none rounded" />
      </div>
    );
  }

  if (cooling.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
          COOLING
        </span>
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] tabular-nums">
          {cooling.length}
        </span>
      </div>
      <ul className="space-y-2">
        {cooling.map((p) => {
          const busy = busyKind?.positionId === p.positionId;
          const claimableNow =
            p.claimableAt > 0 && Date.now() / 1000 >= p.claimableAt;
          return (
            <li
              key={p.positionId}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={{
                background: 'var(--lp-light)',
                border: '1px solid var(--lp-border-light)',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 3,
              }}
            >
              <div className="min-w-0 flex flex-col gap-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-sans text-[18px] font-extrabold tabular-nums tracking-[-0.02em] leading-none">
                    {formatUsdc(p.principalUsdc, { withSuffix: false })}
                  </span>
                  <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                    USDC COOLING
                  </span>
                </div>
                <div className="flex items-center gap-3 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                  {p.claimableAt > 0 ? (
                    <CountdownLabel claimableAt={p.claimableAt} />
                  ) : (
                    <span>preparing cool-down</span>
                  )}
                  {!claimableNow && (
                    <>
                      <span aria-hidden>·</span>
                      <button
                        type="button"
                        onClick={() => onCancel(p.positionId)}
                        disabled={busy || vaultDeployed}
                        title="Cancel this withdrawal and put the stake back to Active. Tenure stays intact."
                        className="mono text-[10px] uppercase tracking-[0.12em] underline-offset-2 hover:underline hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] rounded-sm transition-colors disabled:opacity-50"
                      >
                        {busy ? 'cancelling' : '↶ cancel'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {claimableNow && (
                <button
                  type="button"
                  onClick={() => onClaim(p.positionId)}
                  disabled={busy || vaultDeployed}
                  className="px-4 py-2 mono text-[11px] font-bold uppercase tracking-[0.12em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors disabled:opacity-50 shrink-0"
                  style={{
                    borderTopLeftRadius: 10,
                    borderTopRightRadius: 10,
                    borderBottomLeftRadius: 10,
                    borderBottomRightRadius: 2,
                  }}
                >
                  {busy ? 'Claiming…' : 'Claim to wallet'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/// Marketing + architecture note. Stake doesn't sit idle on mainnet: the
/// same KarwanVault routes deposits through Hashnote USYC so users earn
/// yield on top of the reputation they build. Treasury fees walk the same
/// path. Surfaced here so users (and judges) see the design intent before
/// asking "is this stake just locked up doing nothing?"
function YieldNote() {
  return (
    <div
      className="relative overflow-hidden px-4 py-3.5"
      style={{
        background:
          'linear-gradient(120deg, color-mix(in oklab, var(--lp-accent) 14%, transparent), color-mix(in oklab, var(--lp-accent) 4%, transparent))',
        border: '1px solid color-mix(in oklab, var(--lp-accent) 30%, transparent)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 3,
      }}
    >
      <p className="mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--lp-band-dark)]">
        [:MAINNET YIELD:]
      </p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--lp-dark)]">
        On testnet the vault holds plain USDC. On mainnet the same stake routes
        through{' '}
        <span
          className="font-semibold"
          style={{ color: 'color-mix(in oklab, var(--lp-accent) 70%, var(--lp-dark))' }}
        >
          Hashnote USYC
        </span>{' '}
        and earns roughly <span className="tabular-nums font-semibold">~5%</span> APY while it builds your reputation.
      </p>
    </div>
  );
}

function Note({ tone, children }: { tone: 'info' | 'warn'; children: React.ReactNode }) {
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
