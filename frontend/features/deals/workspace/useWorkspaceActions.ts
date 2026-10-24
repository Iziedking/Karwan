'use client';
import { useCallback, useRef, useState } from 'react';
import { api, ApiError, ConfirmCancelled, type DirectDeal, type DirectDealFundingQuote } from '@/core/api';
import { recordSetupNeeded, runRecordSetup } from '@/features/record/runRecordSetup';
import { useWalletCalls } from '@/features/record/useWalletCalls';
import { useActivation } from '@/shared/hooks/useActivation';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { classifyConfirmError, dealMovedSinceSnapshot, snapshotDeal, type ConfirmSnapshot } from './confirmLogic';
import { actionConsequence, actionLabel, fill, formatUsdcAmount, isIrreversibleAction } from './presentation';
import { useFundingQuote } from './useFundingQuote';

type SheetAction = 'accept' | 'fund' | 'release' | 'claim' | 'ask-payment' | 'review-manually';
type Handoff = 'deliver' | 'respond-extension' | 'respond-cancel' | 'dispute';

export interface SheetState {
  action: SheetAction;
  title: string;
  consequence: string;
  irreversible: boolean;
  /// What confirm saw at open time. A refetch while the sheet sits open must
  /// never let confirm send an action the viewer never actually reviewed.
  snapshot: ConfirmSnapshot;
  /// Set once the fund quote resolves; confirm sends exactly this, never a
  /// freshly refetched one, so the total the buyer approved is the total that
  /// gets authorized.
  quote: DirectDealFundingQuote | null;
  /// Accept only: the seller's Karwan record is set up first (deals on the
  /// escrow family count on a record only if it exists before payment).
  recordFirst?: boolean;
}

const HANDOFF: readonly Handoff[] = ['deliver', 'respond-extension', 'respond-cancel', 'dispute'];

export function useWorkspaceActions(
  jobId: string,
  deal: DirectDeal | null,
  address: string | null,
  counterpartyName: string,
  refresh: () => Promise<void>,
) {
  const copy = useTranslations().dealWorkspace;
  const dd = useTranslations().directDealDetail;
  const { locale } = useLocale();
  const { activated } = useActivation();
  const fundingQuote = useFundingQuote(jobId);
  const live = useTranslations().dealLive;
  const sendWalletCalls = useWalletCalls();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const busyRef = useRef(false);

  const viewerIsBuyer = !!deal && !!address && address.toLowerCase() === deal.buyer.toLowerCase();
  const counterpartyRoleWord = deal && address ? (viewerIsBuyer ? copy.counterparty.seller : copy.counterparty.buyer) : '';
  const displayName = counterpartyName || counterpartyRoleWord;

  const openPrimary = useCallback(() => {
    const next = deal?.view?.next;
    if (!deal || !address || !next?.action) return;
    if ((HANDOFF as readonly string[]).includes(next.action)) {
      window.location.assign(`/deals/${deal.jobId}?workspace=v1&handoff=1#deal-actions`);
      return;
    }
    const snapshot = snapshotDeal(deal);
    setError(null);
    setErrorCode(null);

    if (next.action === 'fund') {
      setSheet({
        action: 'fund',
        title: fill(copy.actions.fundTemplate, { amount: next.amountUsdc ? formatUsdcAmount(next.amountUsdc, locale) : '' }),
        consequence: dd.fundingConsentModal.body,
        irreversible: false,
        snapshot,
        quote: null,
      });
      setBusy(true);
      void fundingQuote.load(address).then((quote) => {
        setBusy(false);
        if (!quote) {
          setSheet(null);
          setError(copy.confirm.failed);
          return;
        }
        setSheet({
          action: 'fund',
          title: fill(copy.actions.fundTemplate, { amount: formatUsdcAmount(quote.fundedAmountUsdc, locale) }),
          consequence: dd.fundingConsentModal.body,
          irreversible: false,
          snapshot,
          quote,
        });
      });
      return;
    }

    if (next.action === 'accept') {
      const base: SheetState = {
        action: 'accept',
        title: activated ? copy.actions.accept : dd.acceptConsentModal.title,
        consequence: activated ? copy.consequence.accept : dd.acceptConsentModal.body,
        irreversible: false,
        snapshot,
        quote: null,
      };
      setSheet(base);
      void recordSetupNeeded().then((needed) => {
        if (!needed) return;
        setSheet((current) => (current?.action === 'accept'
          ? { ...current, recordFirst: true, consequence: `${base.consequence} ${live.recordFirst}` }
          : current));
      });
      return;
    }

    if (next.action === 'ask-payment') {
      setSheet({
        action: 'ask-payment',
        title: live.askPayment,
        consequence: fill(live.askPaymentConsequence, { amount: next.amountUsdc ? formatUsdcAmount(next.amountUsdc, locale) : '' }),
        irreversible: false,
        snapshot,
        quote: null,
      });
      return;
    }

    setSheet({
      action: next.action as SheetAction,
      title: actionLabel(next, copy, locale) ?? '',
      consequence: actionConsequence(next, displayName, copy, locale),
      irreversible: isIrreversibleAction(next.action),
      snapshot,
      quote: null,
    });
  }, [deal, address, locale, copy, dd, live, displayName, activated, fundingQuote]);

  const confirm = useCallback(async () => {
    if (!deal || !address || !sheet || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setErrorCode(null);
    try {
      if (deal.agreementVersion == null || !deal.agreementDigest) {
        setError(dd.errors.agreementChanged);
        return;
      }
      if (dealMovedSinceSnapshot(sheet.snapshot, deal)) {
        setError(dd.errors.agreementChanged);
        await refresh();
        return;
      }
      if (sheet.action === 'accept') {
        const accept = () => api.acceptDirectDeal(deal.jobId, {
          caller: address,
          expectedAgreementVersion: deal.agreementVersion!,
          expectedAgreementDigest: deal.agreementDigest!,
        });
        if (sheet.recordFirst) await runRecordSetup(sendWalletCalls);
        try {
          await accept();
        } catch (err) {
          // The record was needed after all (set up elsewhere and undone, or not read in time).
          if (!(err instanceof ApiError && err.code === 'record_setup_needed')) throw err;
          await runRecordSetup(sendWalletCalls);
          await accept();
        }
      } else if (sheet.action === 'fund') {
        if (!sheet.quote) return;
        await api.fundDirectDeal(deal.jobId, {
          caller: address,
          expectedFeeBps: sheet.quote.feeBps,
          maxFundedAmountUsdc: sheet.quote.fundedAmountUsdc,
          quoteFingerprint: sheet.quote.quoteFingerprint,
          expectedAgreementVersion: deal.agreementVersion,
          expectedAgreementDigest: deal.agreementDigest,
        });
      } else if (sheet.action === 'release') {
        await api.releaseDirectDeal(deal.jobId, address);
      } else if (sheet.action === 'claim') {
        await api.claimDirectDeal(deal.jobId, address);
      } else if (sheet.action === 'ask-payment') {
        // The seller's dispute about buyer silence; the buyer then has 72 hours to answer.
        await api.appealDeal(deal.jobId, address);
      } else {
        await api.reviewDeliveryManually(deal.jobId, address);
      }
      setSheet(null);
      await refresh();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      const code = err instanceof ApiError ? err.code : undefined;
      const message = err instanceof ApiError ? err.message : undefined;
      const kind = classifyConfirmError({ status, code });
      if (kind === 'agreement-changed') {
        setError(dd.errors.agreementChanged);
        await refresh();
      } else if (sheet.action === 'fund' || sheet.action === 'release' || sheet.action === 'claim') {
        if (kind === 'quote-changed') {
          setError(dd.errors.quoteChanged);
          const nextQuote = await fundingQuote.load(address);
          setSheet((current) => (current && current.action === 'fund'
            ? {
                ...current,
                quote: nextQuote,
                title: nextQuote
                  ? fill(copy.actions.fundTemplate, { amount: formatUsdcAmount(nextQuote.fundedAmountUsdc, locale) })
                  : current.title,
              }
            : current));
        } else if (kind === 'insufficient-balance') {
          setErrorCode(code ?? null);
          setError(
            code === 'INSUFFICIENT_STAKE'
              ? dd.errors.insufficientStakeTitle
              : viewerIsBuyer ? dd.errors.insufficientBalanceTitle : dd.errors.insufficientBalanceSeller,
          );
        } else if (kind === 'silent') {
          // A dropped connection or a server crash is never distinguishable
          // from "it actually went through". The money line after refresh is
          // the only honest answer; never call it failed.
          setSheet(null);
          await refresh();
        } else {
          setError(message?.trim() ? message : copy.confirm.failed);
        }
      } else if (sheet.action === 'accept') {
        // Closing the confirmation sheet is a choice, not a failure.
        if (err instanceof ConfirmCancelled) return;
        setError(message?.trim() ? message : err instanceof Error && err.message ? err.message : dd.errors.approvalFailed);
      } else {
        setError(message?.trim() ? message : dd.actionPanel.releaseBlocked.skipFailed);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [deal, address, sheet, refresh, copy, dd, fundingQuote, locale, viewerIsBuyer, sendWalletCalls]);

  const close = useCallback(() => {
    if (busy) return;
    setSheet(null);
    setErrorCode(null);
  }, [busy]);

  const onFunded = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  return { sheet, openPrimary, confirm, close, busy, error, errorCode, viewerIsBuyer, onFunded, displayName };
}
