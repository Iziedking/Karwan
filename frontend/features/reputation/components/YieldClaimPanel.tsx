'use client';
import { useCallback, useState } from 'react';
import { useYieldMe } from '../hooks/useYield';
import { useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  KARWAN_YIELD_DISTRIBUTOR_ADDRESS,
} from '../../profile/config';

/// Per-account yield surface. Mirrors the network block's three-tile shape
/// but for the connected wallet: distributed-to-you, claimed-by-you,
/// available-to-claim. Inline Claim CTA pulls available USDC into the
/// connected wallet (web3) or through the backend DCW (Circle).

const distributorAbi = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

function fmt(s: string | undefined): string {
  if (!s) return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (n < 1) return n.toFixed(4);
  if (n < 1000) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function shortHash(h: string): string {
  return `${h.slice(0, 8)}...${h.slice(-6)}`;
}

export function YieldClaimPanel() {
  const auth = useAuth();
  const address = auth.address as `0x${string}` | undefined;
  const isCircleUser = auth.method === 'circle';
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const { data: yieldData, isLoading: yieldLoading, refresh } = useYieldMe(address);
  const claimable = yieldData?.configured ? yieldData.claimableUsdc : '0';
  const lifetimeCredited = yieldData?.configured ? yieldData.lifetimeCreditedUsdc : '0';
  const lifetimeClaimed = yieldData?.configured ? yieldData.lifetimeClaimedUsdc : '0';
  const loading = yieldLoading;
  const [busy, setBusy] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    refresh();
  }, [refresh]);

  const onWrongChain = !isCircleUser && !!address && chainId !== ARC_CHAIN_ID;
  const claimableNum = Number(claimable);
  const canClaim = !!address && !busy && claimableNum > 0 && !onWrongChain;

  const submit = useCallback(async () => {
    if (!address || claimableNum <= 0) return;
    setError(null);
    setBusy(true);
    setLastTx(null);
    try {
      if (isCircleUser) {
        const res = await api.yieldClaim({ address });
        setLastTx(res.txHash ?? null);
      } else {
        if (!walletClient || !arcClient) return;
        if (chainId !== ARC_CHAIN_ID) {
          await switchChainAsync({ chainId: ARC_CHAIN_ID });
          return;
        }
        const hash = await walletClient.writeContract({
          address: KARWAN_YIELD_DISTRIBUTOR_ADDRESS,
          abi: distributorAbi,
          functionName: 'claim',
          chain: walletClient.chain,
          account: address,
        });
        setLastTx(hash);
        await arcClient.waitForTransactionReceipt({ hash });
      }
      await refetch();
    } catch (err) {
      const msg = (err as Error).message ?? 'claim failed';
      setError(msg.length > 140 ? msg.slice(0, 140) + '...' : msg);
    } finally {
      setBusy(false);
    }
  }, [address, claimableNum, isCircleUser, walletClient, arcClient, chainId, switchChainAsync, refetch]);

  if (!address) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--lp-border-light)] bg-[var(--lp-card)] px-5 py-6 text-[13px] text-[var(--lp-text-muted)]">
        Sign in to see your accrued yield and claim it to your wallet.
      </div>
    );
  }

  const tiles: Array<{ label: string; value: string; hint: string }> = [
    {
      label: 'Distributed to you',
      value: loading ? '—' : fmt(lifetimeCredited),
      hint: 'Lifetime credited to your stake',
    },
    {
      label: 'Claimed by you',
      value: loading ? '—' : fmt(lifetimeClaimed),
      hint: 'Withdrawn to your wallet',
    },
    {
      label: 'Available to claim',
      value: loading ? '—' : fmt(claimable),
      hint: 'Ready to pull right now',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--lp-border-light)] bg-[var(--lp-border-light)]">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="bg-[var(--lp-card)] px-5 py-4 sm:px-6 sm:py-5"
          >
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
              {t.label}
            </p>
            <p className="mt-1.5 font-sans text-[24px] sm:text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-[var(--lp-dark)]">
              {t.value}
              <span className="ms-1.5 text-[13px] font-semibold text-[var(--lp-text-muted)] tracking-normal">
                USDC
              </span>
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--lp-text-sub)]">
              {t.hint}
            </p>
          </div>
        ))}
      </div>

      <div
        className="relative overflow-hidden"
        style={{
          background: 'var(--lp-band-dark)',
          color: 'var(--lp-cream)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
        }}
      >
        <div
          aria-hidden
          className="absolute -top-px -end-px h-16 w-16 pointer-events-none"
          style={{
            background:
              'linear-gradient(225deg, var(--lp-accent) 0% 8%, transparent 9%)',
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6">
          <div className="min-w-0">
            <p className="mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--lp-accent)]">
              [:CLAIM:]
            </p>
            <p className="mt-2 font-sans text-[28px] sm:text-[32px] font-extrabold leading-none tracking-[-0.02em] tabular-nums">
              {loading ? '—' : Number(claimable).toFixed(4)}
              <span className="ms-2 text-[14px] font-semibold text-white/45 tracking-normal">
                USDC ready
              </span>
            </p>
            {lastTx ? (
              <a
                href={ARC_EXPLORER_TX(lastTx)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-accent)]"
              >
                tx {shortHash(lastTx)} ↗
              </a>
            ) : null}
          </div>

          <div className="flex flex-col items-stretch gap-1.5 min-w-[180px]">
            {onWrongChain ? (
              <button
                onClick={() => switchChainAsync({ chainId: ARC_CHAIN_ID }).catch(() => {})}
                className="rounded-md border border-amber-300/60 bg-amber-200/15 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-amber-100"
              >
                Switch to Arc
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!canClaim}
                className="rounded-md px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em] transition disabled:opacity-35 disabled:cursor-not-allowed"
                style={{
                  background: canClaim ? 'var(--lp-accent)' : 'rgba(255,255,255,0.08)',
                  color: canClaim ? 'var(--lp-band-dark)' : 'rgba(255,255,255,0.55)',
                }}
              >
                {busy
                  ? 'Claiming'
                  : claimableNum > 0
                    ? `Claim ${claimableNum.toFixed(4)}`
                    : 'Nothing yet'}
              </button>
            )}
            <a
              href={`https://testnet.arcscan.app/address/${KARWAN_YIELD_DISTRIBUTOR_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              className="text-center mono text-[9px] uppercase tracking-[0.14em] text-white/40 hover:text-white/70"
            >
              contract ↗
            </a>
          </div>
        </div>
        {error ? (
          <p className="relative px-5 sm:px-7 pb-4 text-[11px] text-red-200/90 break-all">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
