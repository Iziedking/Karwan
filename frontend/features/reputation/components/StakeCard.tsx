'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import { parseUnits } from 'viem';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useReputation } from '../hooks/useReputation';
import { cn } from '@/shared/utils/cn';
import { formatUsdc } from '@/shared/utils/format';
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

export function StakeCard() {
  const auth = useAuth();
  const address = auth.address as `0x${string}` | undefined;
  const isCircleUser = auth.method === 'circle';
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const { data: rep, refetch: refetchRep } = useReputation(address);

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
  const [totalCooling, setTotalCooling] = useState('0');
  const [cooldownDays, setCooldownDays] = useState(7);
  const [vaultDeployed, setVaultDeployed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState<number | ''>(5);
  const [log, setLog] = useState<ActionLog[]>([]);
  const [busyKind, setBusyKind] = useState<{ kind: ActionKind; positionId?: string } | null>(null);

  const refetchPositions = useCallback(async () => {
    if (!address) return;
    try {
      const r = await api.vaultPositions(address);
      setPositions(r.positions);
      setTotalActive(r.totalActiveUsdc);
      setTotalCooling(r.totalCoolingUsdc);
      setCooldownDays(r.cooldownDays);
      setVaultDeployed(r.vaultAddress != null);
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
    if (typeof amount !== 'number' || amount <= 0) return;
    const amountUsdc = amount;
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
      await refetchPositions();
      await refetchRep();
    } catch (err) {
      patchLog(logId, { status: 'failed', error: (err as Error).message });
    } finally {
      setBusyKind(null);
    }
  }, [address, amount, isCircleUser, walletClient, arcClient, refetchPositions, refetchRep, pushLog, patchLog]);

  // -------------------- position actions --------------------

  const positionAction = useCallback(
    async (kind: 'request' | 'cancel' | 'claim', positionId: string) => {
      if (!address) return;
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
    [address, isCircleUser, walletClient, arcClient, refetchPositions, refetchRep, pushLog, patchLog],
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
      {/* HEADER */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="space-y-2 min-w-0">
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
            {Number(totalCooling) > 0 && (
              <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                · {formatUsdc(totalCooling, { withSuffix: false })} cooling
              </span>
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

      {/* VAULT NOT DEPLOYED STATE */}
      {vaultDeployed === false && (
        <Note tone="info">
          KarwanVault is not deployed on this environment. Set
          {' '}<code className="mono text-[11px]">KARWAN_VAULT_ADDR</code> in <code className="mono text-[11px]">.env</code> and
          restart the backend.
        </Note>
      )}

      {/* DEPOSIT FORM */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            DEPOSIT
          </span>
          {stakeBoost != null && (
            <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
              CURRENT BOOST +{(stakeBoost * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <div className="flex items-stretch gap-2">
          <input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={busyKind?.kind === 'deposit'}
            className="form-input form-input-num flex-1 min-w-0"
            aria-label="Deposit amount in USDC"
          />
          <button
            type="button"
            onClick={submitDeposit}
            disabled={
              busyKind?.kind === 'deposit' ||
              !amount ||
              vaultDeployed === false
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
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] leading-relaxed">
          {cooldownDays}-day cool-down on withdrawal. Cancel anytime during cool-down to keep your tenure.
        </p>
      </div>

      {/* POSITIONS */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            POSITIONS
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)] tabular-nums">
            {positions.length}
          </span>
        </div>

        {loading && (
          <div className="space-y-2">
            <div className="h-14 bg-black/[0.05] animate-pulse motion-reduce:animate-none rounded" />
            <div className="h-14 bg-black/[0.05] animate-pulse motion-reduce:animate-none rounded" />
          </div>
        )}

        {!loading && positions.length === 0 && (
          <p className="text-[13px] text-[var(--lp-text-sub)] leading-relaxed py-2">
            No positions yet. Deposit some USDC above to start earning reputation.
          </p>
        )}

        {!loading && positions.length > 0 && (
          <ul className="space-y-2">
            {positions.map((p) => {
              const busy = busyKind?.positionId === p.positionId;
              const claimableNow =
                p.state === 'cooling' &&
                p.claimableAt > 0 &&
                Date.now() / 1000 >= p.claimableAt;
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
                        USDC · #{p.positionId}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
                      <StatePill state={p.state} />
                      <span>·</span>
                      <span>tenure {p.tenureDays.toFixed(1)}d</span>
                      {p.state === 'cooling' && p.claimableAt > 0 && (
                        <>
                          <span>·</span>
                          <CountdownLabel claimableAt={p.claimableAt} />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.state === 'active' && (
                      <button
                        type="button"
                        onClick={() => positionAction('request', p.positionId)}
                        disabled={busy || vaultDeployed === false}
                        className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em] border border-black/15 text-[var(--lp-dark)] hover:bg-black/[0.04] transition-colors disabled:opacity-50"
                        style={{
                          borderTopLeftRadius: 8,
                          borderTopRightRadius: 8,
                          borderBottomLeftRadius: 8,
                          borderBottomRightRadius: 2,
                        }}
                      >
                        {busy ? 'Working' : 'Request'}
                      </button>
                    )}
                    {p.state === 'cooling' && (
                      <>
                        <button
                          type="button"
                          onClick={() => positionAction('cancel', p.positionId)}
                          disabled={busy || vaultDeployed === false}
                          className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em] border border-black/15 text-[var(--lp-dark)] hover:bg-black/[0.04] transition-colors disabled:opacity-50"
                          style={{
                            borderTopLeftRadius: 8,
                            borderTopRightRadius: 8,
                            borderBottomLeftRadius: 8,
                            borderBottomRightRadius: 2,
                          }}
                        >
                          {busy ? 'Working' : 'Cancel'}
                        </button>
                        {claimableNow && (
                          <button
                            type="button"
                            onClick={() => positionAction('claim', p.positionId)}
                            disabled={busy || vaultDeployed === false}
                            className="px-3 py-1.5 mono text-[10px] font-bold uppercase tracking-[0.12em] bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] transition-colors disabled:opacity-50"
                            style={{
                              borderTopLeftRadius: 8,
                              borderTopRightRadius: 8,
                              borderBottomLeftRadius: 8,
                              borderBottomRightRadius: 2,
                            }}
                          >
                            {busy ? 'Working' : 'Claim'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
