const USDC_DECIMALS = 6;
const USDC_SCALE = 1_000_000n;

function parseUsdcUnits(value: string): bigint {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new Error('Invalid USDC amount');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * USDC_SCALE + BigInt(fraction.padEnd(USDC_DECIMALS, '0'));
}

function unitsToDecimal(units: bigint): string {
  const whole = units / USDC_SCALE;
  const fraction = (units % USDC_SCALE).toString().padStart(USDC_DECIMALS, '0');
  const visibleFraction = fraction.replace(/0+$/, '').padEnd(2, '0');
  return `${whole.toLocaleString('en-US')}.${visibleFraction}`;
}

export function usdcDecimalFromUnits(units: string): string {
  if (!/^\d+$/.test(units)) throw new Error('Invalid USDC units');
  const amount = BigInt(units);
  const whole = amount / USDC_SCALE;
  const fraction = (amount % USDC_SCALE).toString().padStart(USDC_DECIMALS, '0');
  const visibleFraction = fraction.replace(/0+$/, '');
  return visibleFraction ? `${whole}.${visibleFraction}` : whole.toString();
}

export function onChainFundingSummary(input: {
  dealAmountWei: string;
  sellerNetWei: string;
  feeTotalWei: string;
}): {
  dealAmountUsdc: string;
  buyerFeeUsdc: string;
  feeTotalUsdc: string;
  fundedAmountUsdc: string;
  sellerNetUsdc: string;
} {
  const deal = BigInt(input.dealAmountWei);
  const sellerNet = BigInt(input.sellerNetWei);
  const feeTotal = BigInt(input.feeTotalWei);
  const sellerFee = deal - sellerNet;
  const buyerFee = feeTotal - sellerFee;
  return {
    dealAmountUsdc: usdcDecimalFromUnits(deal.toString()),
    buyerFeeUsdc: usdcDecimalFromUnits(buyerFee.toString()),
    feeTotalUsdc: usdcDecimalFromUnits(feeTotal.toString()),
    fundedAmountUsdc: usdcDecimalFromUnits((deal + buyerFee).toString()),
    sellerNetUsdc: usdcDecimalFromUnits(sellerNet.toString()),
  };
}

/** Formats backend-quoted USDC without converting through a JS number. */
export function formatExactUsdc(value: string): string {
  return `${unitsToDecimal(parseUsdcUnits(value))} USDC`;
}

/** Calculates a milestone share in integer micro-USDC, rounding down on-chain style. */
export function portionOfUsdc(value: string, percentage: number): string {
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('Invalid milestone percentage');
  }
  const units = (parseUsdcUnits(value) * BigInt(percentage)) / 100n;
  return `${unitsToDecimal(units)} USDC`;
}

export function formatFeeRate(feeBps: number): string {
  const whole = Math.floor(feeBps / 100);
  const fraction = String(feeBps % 100).padStart(2, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}
