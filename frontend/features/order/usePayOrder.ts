'use client';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Listing, type ListingQuote } from '@/core/api';
import { fundingShortfall } from '@/features/deposit/fundingPlan';
import { orderTermsOf } from './orderModel';

export type PayOutcome = 'changed' | 'closed' | 'own' | 'failed' | { totalChanged: string } | null;
/// The deal a payment went into, and when, for the Paid in result (view 48).
export interface PaidIn { jobId: string; at: number }

const sameUsdc = (a: string, b: string) => Math.round(Number(a) * 1e6) === Math.round(Number(b) * 1e6);

/// Pressing Pay: the deal is made from the listing as it stands, the seller's
/// agent accepts it in the same request, any shortfall moves to the buying
/// agent the way the deal page does it, and the money is paid in at the total
/// the review showed. Nothing exists until this runs (view 44, D10). A payment
/// that went in stays on the page as the Paid in result (view 48).
export function usePayOrder(input: {
  listing: Listing | null;
  quote: ListingQuote | null;
  address: string | null;
  /// Email and passkey accounts: Karwan moves their balance to the buying agent.
  circle: boolean;
  buyerAgentUsdc: number | null;
}) {
  const { listing, quote, address, circle, buyerAgentUsdc } = input;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PayOutcome>(null);
  const [paid, setPaid] = useState<PaidIn | null>(null);
  const busyRef = useRef(false);
  // A deal made by an earlier press is paid in on the next, never made twice.
  const jobRef = useRef<string | null>(null);

  const pay = useCallback(async () => {
    if (busyRef.current || !listing || !quote || !address) return;
    busyRef.current = true;
    setBusy(true);
    setOutcome(null);
    let fundSent = false;
    try {
      let jobId = jobRef.current;
      if (!jobId) {
        const created = await api.createDirectDeal({
          buyerAddress: address,
          sellerAddress: listing.sellerUser,
          ...orderTermsOf(listing),
          listingId: listing.id,
        });
        jobId = created.deal.jobId;
        jobRef.current = jobId;
        if (!created.agentAccepted) {
          router.push(`/deals/${jobId}`);
          return;
        }
      }
      const { quote: funding } = await api.directDealFundingQuote(jobId, address);
      if (!sameUsdc(funding.fundedAmountUsdc, quote.youPayUsdc)) {
        setOutcome({ totalChanged: funding.fundedAmountUsdc });
        await queryClient.invalidateQueries({ queryKey: ['order', 'quote', listing.id] });
        return;
      }
      const missing = fundingShortfall(Number(funding.fundedAmountUsdc), buyerAgentUsdc ?? 0);
      if (missing > 0) {
        if (!circle) {
          setOutcome('failed');
          return;
        }
        const moved = await api.fundAgent({ address, agent: 'buyer', amountUsdc: missing, requestId: crypto.randomUUID() });
        if (moved.movementState === 'needs_attention' || moved.movementState === 'cancelled') {
          setOutcome('failed');
          return;
        }
      }
      const { deal } = await api.directDeal(jobId, address);
      if (deal.agreementVersion == null || !deal.agreementDigest) {
        router.push(`/deals/${jobId}`);
        return;
      }
      fundSent = true;
      await api.fundDirectDeal(jobId, {
        caller: address,
        expectedFeeBps: funding.feeBps,
        maxFundedAmountUsdc: funding.fundedAmountUsdc,
        quoteFingerprint: funding.quoteFingerprint,
        expectedAgreementVersion: deal.agreementVersion,
        expectedAgreementDigest: deal.agreementDigest,
      });
      setPaid({ jobId, at: Date.now() });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const status = err instanceof ApiError ? err.status : undefined;
      if (code === 'LISTING_CHANGED') setOutcome('changed');
      else if (code === 'LISTING_CLOSED') setOutcome('closed');
      else if (code === 'OWN_LISTING') setOutcome('own');
      // A person check the deal asks for is done on the deal page.
      else if (jobRef.current && code && /HIGH_SIGNAL|WORLD_ID/.test(code)) router.push(`/deals/${jobRef.current}`);
      // A payment that may have gone through is only ever shown on the deal.
      else if (fundSent && jobRef.current && !(status && status >= 400 && status < 500)) router.push(`/deals/${jobRef.current}`);
      else setOutcome('failed');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [listing, quote, address, circle, buyerAgentUsdc, router, queryClient]);

  return { pay, busy, outcome, paid, clearOutcome: () => setOutcome(null) };
}
