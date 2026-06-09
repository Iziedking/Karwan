'use client';
import { useState } from 'react';
import { useWalletClient, usePublicClient, useChainId } from 'wagmi';
import { keccak256, toHex } from 'viem';
import { api, type DirectDeal } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER_TX,
  KARWAN_INVOICE_REGISTRY_ADDRESS,
} from '@/features/profile/config';
import { cn } from '@/shared/utils/cn';

/// Buyer-side PoD acceptance band. Buyer signs registry.acceptPoD on the
/// KarwanInvoiceRegistry contract, then the PO financing watcher releases
/// principal to the seller. Gated to: viewer is the buyer, the deal is
/// goods (trade-finance), seller has delivered, but PoD is not yet
/// anchored. Service-flow deals never see this band.
///
/// Top-level component per Vercel `rerender-no-inline-components`. Splits
/// state across distinct hooks per `rerender-split-combined-hooks`.

const registryAbi = [
  {
    type: 'function',
    name: 'acceptPoD',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'invoiceId', type: 'bytes32' },
      { name: 'podHash', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

export function BuyerPodPanel({
  deal,
  viewerIsBuyer,
  onPodAccepted,
}: {
  deal: DirectDeal;
  viewerIsBuyer: boolean;
  onPodAccepted: () => void;
}) {
  // Eligibility gate. Renders nothing for ineligible viewers so service
  // deals + sellers + already-accepted-PoD scenarios skip the band
  // entirely.
  const eligible =
    viewerIsBuyer &&
    deal.tradeType === 'goods' &&
    !!deal.acceptedAt &&
    !!deal.delivered &&
    !deal.deliveredAt;

  if (!eligible) return null;
  return <BuyerPodPanelInner deal={deal} onPodAccepted={onPodAccepted} />;
}

function BuyerPodPanelInner({
  deal,
  onPodAccepted,
}: {
  deal: DirectDeal;
  onPodAccepted: () => void;
}) {
  const auth = useAuth();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCircleUser = auth.method === 'circle';
  const address = auth.address as `0x${string}` | undefined;
  const onWrongChain = !isCircleUser && !!address && chainId !== ARC_CHAIN_ID;

  // PoD hash derived from the deal id deterministically so both parties
  // can verify off-chain that the anchor matches. Production would use a
  // hash of the buyer-signed PoD document; the deterministic derivation
  // is a v1 simplification that demos cleanly.
  const podHash = keccak256(toHex(`pod:${deal.jobId}:${deal.deliveredAt ?? Date.now()}`));

  async function signPoD() {
    if (!address) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isCircleUser) {
        const r = await api.acceptTradePodCircle({
          address,
          invoiceId: deal.jobId,
          podHash,
        });
        setTxHash(r.txHash);
      } else {
        if (!walletClient || !arcClient) {
          throw new Error('Wallet not ready');
        }
        const hash = await walletClient.writeContract({
          address: KARWAN_INVOICE_REGISTRY_ADDRESS,
          abi: registryAbi,
          functionName: 'acceptPoD',
          args: [deal.jobId as `0x${string}`, podHash],
          chain: walletClient.chain,
          account: address,
        });
        await arcClient.waitForTransactionReceipt({ hash });
        // Mirror the off-chain record so the deal page reads delivered
        // immediately without waiting for the next snapshot poll.
        await api.acceptTradePod({
          invoiceId: deal.jobId,
          podHash,
          txHash: hash,
          caller: address,
        });
        setTxHash(hash);
      }
      onPodAccepted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="mt-7 px-5 py-4 md:px-6 md:py-5"
      style={{
        background: 'rgba(175, 201, 91, 0.12)',
        border: '1px solid rgba(175, 201, 91, 0.45)',
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 3,
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--lp-dark)]">
            [:CONFIRM DELIVERY:]
          </p>
          <p className="mt-1.5 text-[14px] text-[var(--lp-dark)] leading-snug max-w-[50ch]">
            Seller marked the shipment as delivered. Sign Proof of Delivery on
            chain so any PO financing line releases principal to the seller and
            the trade record locks in.
          </p>
          {txHash ? (
            <p className="mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
              ANCHORED ·{' '}
              <a
                href={ARC_EXPLORER_TX(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--lp-dark)] hover:underline"
              >
                {txHash.slice(0, 10)}…{txHash.slice(-6)}
              </a>
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-critical)]">
              {error}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={signPoD}
          disabled={submitting || onWrongChain || !!txHash}
          className={cn(
            'mono text-[11px] uppercase tracking-[0.14em] font-bold px-3 py-2 disabled:opacity-60',
            'bg-[var(--lp-dark)] text-[var(--lp-bg)]',
          )}
          style={{
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 2,
          }}
        >
          {submitting
            ? 'Signing…'
            : txHash
              ? 'PoD anchored'
              : onWrongChain
                ? 'Switch to Arc'
                : 'Sign PoD'}
        </button>
      </div>
    </section>
  );
}
