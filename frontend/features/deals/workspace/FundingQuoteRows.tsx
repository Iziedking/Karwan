'use client';
import Link from 'next/link';
import type { DirectDealFundingQuote } from '@/core/api';
import { FundAgentOptions } from '@/features/deposit/components/FundAgentOptions';
import { useActivation } from '@/shared/hooks/useActivation';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { formatFeeRate } from '../fundingPresentation';
import { formatUsdcAmount } from './presentation';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--line)] py-2 first:border-t-0 first:pt-0">
      <span className="text-[14px] text-[var(--ink-secondary)] font-medium">{label}</span>
      <span className="mono tabular-nums text-[14px] font-medium text-[var(--ink)]">{value}</span>
    </div>
  );
}

/// The exact total the fund sheet is about to authorize, itemized, plus the
/// same top-up routes the classic deal page offers when the buyer's agent
/// can't cover it. Lives inside the confirm sheet's children so the amount
/// being approved, and the way to fix a shortfall, are both visible before
/// the buyer presses confirm.
export function FundingQuoteRows({ quote, errorCode, viewerIsBuyer, onFunded, onBusyChange }: {
  quote: DirectDealFundingQuote | null;
  errorCode: string | null;
  viewerIsBuyer: boolean;
  onFunded: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const copy = useTranslations().directDealDetail;
  const { locale } = useLocale();
  const auth = useAuth();
  const { agents } = useActivation();
  const buyerAgent = agents?.buyer ?? null;

  return (
    <div>
      {quote ? (
        <div>
          <Row label={copy.fundingConsentModal.dealAmount} value={`${formatUsdcAmount(quote.dealAmountUsdc, locale)} USDC`} />
          <Row
            label={`${copy.fundingConsentModal.buyerFee} · ${formatFeeRate(quote.feeBps)}`}
            value={`${formatUsdcAmount(quote.buyerFeeUsdc, locale)} USDC`}
          />
          <Row label={copy.fundingConsentModal.sellerReceives} value={`${formatUsdcAmount(quote.sellerNetUsdc, locale)} USDC`} />
          <p className="pt-2 text-[14px] leading-snug text-[var(--ink-secondary)] font-medium">{copy.fundingConsentModal.noConversion}</p>
        </div>
      ) : null}
      {errorCode === 'INSUFFICIENT_AGENT_BALANCE' ? (
        viewerIsBuyer ? (
          buyerAgent ? (
            <div data-testid="deal-funding-recovery" className="mt-3">
              <FundAgentOptions
                agent="buyer"
                recipient={buyerAgent}
                otherAgentAddress={agents?.seller ?? null}
                amountUsdc={quote ? Number(quote.fundedAmountUsdc) : 0}
                circleAccount={auth.method === 'circle'}
                onFunded={onFunded}
                onBusyChange={onBusyChange}
              />
            </div>
          ) : (
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">
              {copy.errors.insufficientBalanceBuyerPrefix}{' '}
              <Link href="/profile" className="font-medium text-[var(--ink)] rounded-full underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)]">
                {copy.errors.insufficientBalanceBuyerLink}
              </Link>
            </p>
          )
        ) : (
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{copy.errors.insufficientBalanceSeller}</p>
        )
      ) : null}
      {errorCode === 'INSUFFICIENT_STAKE' && !viewerIsBuyer ? (
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">
          <Link href="/stake" className="font-medium text-[var(--ink)] underline underline-offset-2">
            {copy.errors.insufficientStakeLink}
          </Link>{' '}
          {copy.errors.insufficientStakeSuffix}
        </p>
      ) : null}
    </div>
  );
}
