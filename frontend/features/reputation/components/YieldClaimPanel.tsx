'use client';
import { useCallback, useId, useState } from 'react';
import { useYieldMe } from '../hooks/useYield';
import { useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Hint } from '@/shared/components/Hint';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { chainErrorMessage } from '@/shared/utils/chainError';
import { requireConfirmedTx } from '@/shared/chain/confirmTx';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  KARWAN_YIELD_DISTRIBUTOR_ADDRESS,
} from '../../profile/config';

/// The account's yield: what has been earned, what has been claimed, and one
/// Claim that carries the amount ready now. Claiming moves money, so it asks in
/// the confirm sheet first; the result shows in place with its proof.

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
  if (!s) return '0';
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n < 1) return n.toFixed(4);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function YieldClaimPanel() {
  const t = useTranslations().yieldClaim;
  const auth = useAuth();
  const address = auth.address as `0x${string}` | undefined;
  const isCircleUser = auth.method === 'circle';
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const chainCopy = useTranslations().chainErrors;
  const titleId = useId();

  const { data: yieldData, isLoading: loading, refresh } = useYieldMe(address);
  const claimable = yieldData?.configured ? yieldData.claimableUsdc : '0';
  const lifetimeCredited = yieldData?.configured ? yieldData.lifetimeCreditedUsdc : '0';
  const lifetimeClaimed = yieldData?.configured ? yieldData.lifetimeClaimedUsdc : '0';
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onWrongChain = !isCircleUser && !!address && chainId !== ARC_CHAIN_ID;
  const claimableNum = Number(claimable);
  const amount = fmt(claimable);
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
        await requireConfirmedTx(arcClient, hash, chainCopy.reverted);
      }
      await refresh();
      setSheetOpen(false);
    } catch (err) {
      setError(chainErrorMessage(err, chainCopy, t.error));
    } finally {
      setBusy(false);
    }
  }, [address, claimableNum, isCircleUser, walletClient, arcClient, chainId, switchChainAsync, refresh, chainCopy, t.error]);

  if (!address) {
    return <p className="text-[14px] font-medium text-[var(--lp-text-sub)]">{t.signedOut}</p>;
  }

  const claimLabel = busy ? t.claiming : t.claimTemplate.replace('{amount}', amount);

  return (
    <div className="divide-y divide-[var(--lp-border-light)]">
      <div className="flex min-h-[52px] items-center justify-between gap-3 pb-3">
        <span className="inline-flex items-center gap-1 text-[15px] font-medium text-[var(--lp-dark)]">
          {t.earned}
          <Hint side="bottom">{t.earnedHint}</Hint>
        </span>
        <span className="text-[15px] font-semibold tabular-nums text-[var(--lp-dark)]">{loading ? ' ' : `${fmt(lifetimeCredited)} USDC`}</span>
      </div>
      <div className="flex min-h-[52px] items-center justify-between gap-3 py-3">
        <span className="text-[15px] font-medium text-[var(--lp-dark)]">{t.claimed}</span>
        <span className="text-[15px] font-semibold tabular-nums text-[var(--lp-text-sub)]">{loading ? ' ' : `${fmt(lifetimeClaimed)} USDC`}</span>
      </div>
      <div className="pt-4">
        {onWrongChain ? (
          <button
            type="button"
            onClick={() => switchChainAsync({ chainId: ARC_CHAIN_ID }).catch(() => {})}
            className="min-h-12 w-full rounded-full border border-[var(--lp-outline-strong)] px-5 text-[15px] font-semibold text-[var(--lp-dark)]"
          >
            {t.switchToArc}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            disabled={!canClaim}
            className="min-h-12 w-full rounded-full bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--tint)] disabled:text-[var(--ink-secondary)]"
          >
            {claimableNum > 0 ? claimLabel : t.nothingYet}
          </button>
        )}
        {lastTx && !busy ? (
          <p role="status" className="mt-3 text-[14px] font-medium text-[var(--lp-text-sub)]">
            {t.done}{' '}
            <a href={ARC_EXPLORER_TX(lastTx)} target="_blank" rel="noreferrer" className="font-semibold text-[var(--lp-dark)] underline underline-offset-4">
              {t.proof}
            </a>
          </p>
        ) : null}
      </div>

      <ConfirmSheetShell open={sheetOpen} labelledBy={titleId} busy={busy} onClose={() => setSheetOpen(false)}>
        <h2 id={titleId} className="text-[20px] font-semibold text-[var(--lp-dark)]">{t.sheetTitleTemplate.replace('{amount}', amount)}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-text-sub)] font-medium">{t.sheetBody}</p>
        {error ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{error}</p> : null}
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            aria-busy={busy}
            className="min-h-12 rounded-full bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] disabled:opacity-50"
          >
            {busy ? t.claiming : t.confirm}
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            disabled={busy}
            className="min-h-12 rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-40"
          >
            {t.cancel}
          </button>
        </div>
      </ConfirmSheetShell>
    </div>
  );
}
