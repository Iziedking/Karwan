import { formatUnits, keccak256, parseUnits, toBytes } from 'viem';

export const USDC_DECIMALS = 6;

export interface DirectDealFundingQuote {
  settlementCurrency: 'USDC';
  localCurrencyConversion: 'not-provided';
  dealAmountUsdc: string;
  buyerFeeUsdc: string;
  sellerFeeUsdc: string;
  feeTotalUsdc: string;
  fundedAmountUsdc: string;
  sellerNetUsdc: string;
  feeBps: number;
  quotedAt: number;
  quoteFingerprint: `0x${string}`;
}

export interface DirectDealFundingAuthorization {
  expectedFeeBps: number;
  maxFundedAmountUsdc: string;
  quoteFingerprint: string;
}

/** Exact-match authorization. A lower or higher total both require re-review. */
export function fundingAuthorizationMatches(
  quote: DirectDealFundingQuote,
  authorization: DirectDealFundingAuthorization,
): boolean {
  return (
    authorization.expectedFeeBps === quote.feeBps &&
    authorization.quoteFingerprint.toLowerCase() === quote.quoteFingerprint.toLowerCase() &&
    parseUnits(authorization.maxFundedAmountUsdc, USDC_DECIMALS) ===
      parseUnits(quote.fundedAmountUsdc, USDC_DECIMALS)
  );
}

/**
 * Mirrors KarwanEscrow.fundEscrow using integer USDC units. The fingerprint
 * intentionally excludes quotedAt: it identifies the economic terms the
 * buyer approved, not a browser timestamp.
 */
export function buildDirectDealFundingQuote(input: {
  jobId: string;
  dealAmountUsdc: string;
  feeBps: number;
  quotedAt?: number;
}): DirectDealFundingQuote {
  if (!Number.isInteger(input.feeBps) || input.feeBps < 0 || input.feeBps > 10_000) {
    throw new Error('feeBps must be an integer between 0 and 10000');
  }

  const dealAmount = parseUnits(input.dealAmountUsdc, USDC_DECIMALS);
  if (dealAmount <= 0n) throw new Error('deal amount must be positive');

  const feeTotal = (dealAmount * BigInt(input.feeBps)) / 10_000n;
  const buyerFee = feeTotal / 2n;
  const sellerFee = feeTotal - buyerFee;
  const fundedAmount = dealAmount + buyerFee;
  const sellerNet = dealAmount - sellerFee;
  const normalizedAmount = formatUnits(dealAmount, USDC_DECIMALS);
  const fundedAmountUsdc = formatUnits(fundedAmount, USDC_DECIMALS);
  const quoteFingerprint = keccak256(
    toBytes(
      [
        input.jobId.toLowerCase(),
        normalizedAmount,
        String(input.feeBps),
        fundedAmountUsdc,
        formatUnits(sellerNet, USDC_DECIMALS),
      ].join(':'),
    ),
  );

  return {
    settlementCurrency: 'USDC',
    localCurrencyConversion: 'not-provided',
    dealAmountUsdc: normalizedAmount,
    buyerFeeUsdc: formatUnits(buyerFee, USDC_DECIMALS),
    sellerFeeUsdc: formatUnits(sellerFee, USDC_DECIMALS),
    feeTotalUsdc: formatUnits(feeTotal, USDC_DECIMALS),
    fundedAmountUsdc,
    sellerNetUsdc: formatUnits(sellerNet, USDC_DECIMALS),
    feeBps: input.feeBps,
    quotedAt: input.quotedAt ?? Date.now(),
    quoteFingerprint,
  };
}
