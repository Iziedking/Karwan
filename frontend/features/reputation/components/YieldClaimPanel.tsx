'use client';
import { useCallback, useEffect, useState } from 'react';
import { useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  KARWAN_YIELD_DISTRIBUTOR_ADDRESS,
} from '../../profile/config';

/// Per-staker yield surface. Reads `claimable(address)` off the
/// KarwanYieldDistributor every 12s while open. Web3 users sign `claim()`
/// from their connected wallet; Circle users route through the backend
/// DCW signing path. Compact, lime-accented, plain numbers up front — the
/// staker's mental model is "how much can I pull right now."

const distributorAbi = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

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

  const [claimable, setClaimable] = useState('0');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!address) return;
    try {
      const r = await api.yieldMe(address);
      if (!r.configured) {
        setClaimable('0');
        return;
      }
      setClaimable(r.claimableUsdc);
    } catch {
      // silent — UI shows "—" if it stays unset
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    refetch();
    const id = setInterval(refetch, 12_000);
    return () => clearInterval(id);
  }, [address, refetch]);

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

  if (!address) return null;

  const displayAmount = loading ? '—' : Number(claimable).toFixed(4);

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: 'var(--lp-band-dark)',
        color: 'var(--lp-cream)',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 4,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 18px 56px -20px rgba(0,0,0,0.18)',
      }}
    >
      {/* Geometric corner mark, flat fill, not a gradient. */}
      <div
        aria-hidden
        className="absolute -top-px -end-px h-16 w-16 pointer-events-none"
        style={{
          background:
            'linear-gradient(225deg, var(--lp-accent) 0% 8%, transparent 9%)',
        }}
      />

      <div className="relative px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--lp-accent)]">
            [:LIVE YIELD:]
          </p>
          <a
            href={`https://testnet.arcscan.app/address/${KARWAN_YIELD_DISTRIBUTOR_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="mono text-[9px] uppercase tracking-[0.14em] text-white/40 hover:text-white/70"
          >
            contract ↗
          </a>
        </div>

        <div className="mt-4 flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="font-sans text-[44px] sm:text-[56px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
              {displayAmount}
              <span className="ms-2 align-bottom text-[16px] font-semibold text-white/45 tracking-normal">
                USDC
              </span>
            </p>
            <p className="mt-1.5 text-[12px] text-white/55">
              Your share of protocol yield, credited daily. Pulls straight
              to your wallet.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-1.5 min-w-[160px]">
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
            {lastTx ? (
              <a
                href={ARC_EXPLORER_TX(lastTx)}
                target="_blank"
                rel="noreferrer"
                className="text-center mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-accent)]"
              >
                tx {shortHash(lastTx)} ↗
              </a>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-[11px] text-red-200/90 break-all">{error}</p>
        ) : null}

        {claimableNum === 0 && !loading ? (
          <p className="mt-3 text-[11px] text-white/45">
            Yield drops once a day. Your share scales with the size and
            tenure of your active stake.
          </p>
        ) : null}
      </div>
    </section>
  );
}
