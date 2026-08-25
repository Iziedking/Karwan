const USDC_DECIMALS = 6;
const USDC_SCALE = 1_000_000n;
const BPS_SCALE = 10_000n;

function parseUsdcMicros(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) {
    throw new Error('Invalid USDC amount');
  }
  const [whole, fraction = ''] = normalized.split('.');
  return BigInt(whole) * USDC_SCALE + BigInt(fraction.padEnd(USDC_DECIMALS, '0'));
}

function formatUsdcMicros(value: bigint): string {
  const whole = value / USDC_SCALE;
  const fraction = (value % USDC_SCALE).toString().padStart(USDC_DECIMALS, '0');
  const visibleFraction = fraction.replace(/0+$/, '');
  return visibleFraction ? `${whole}.${visibleFraction}` : whole.toString();
}

export interface FactoringQuote {
  invoiceValueUsdc: string;
  settlementAssignedUsdc: string;
  advanceUsdc: string;
  settlementReturnUsdc: string;
  spreadUsdc: string;
  requestCappedByAvailability: boolean;
}

/**
 * Builds the financier quote using exact micro-USDC arithmetic.
 *
 * The seller's requested amount is the portion of the future settlement they
 * offer to a financier. It is not evidence that any part of the invoice was
 * previously paid. The financier advances that assigned amount less the
 * discount and receives the assigned amount after buyer approval.
 */
export function buildFactoringQuote(input: {
  invoiceValueUsdc: string;
  escrowAvailableUsdc?: string;
  requestedSettlementUsdc?: string;
  discountBps: number;
}): FactoringQuote {
  if (!Number.isInteger(input.discountBps) || input.discountBps < 0 || input.discountBps > 10_000) {
    throw new Error('Invalid discount');
  }

  const invoiceValue = parseUsdcMicros(input.invoiceValueUsdc);
  const escrowAvailable = input.escrowAvailableUsdc
    ? parseUsdcMicros(input.escrowAvailableUsdc)
    : invoiceValue;
  const requestedSettlement = input.requestedSettlementUsdc
    ? parseUsdcMicros(input.requestedSettlementUsdc)
    : escrowAvailable;
  const settlementAssigned = requestedSettlement < escrowAvailable
    ? requestedSettlement
    : escrowAvailable;
  const advance = (settlementAssigned * BigInt(10_000 - input.discountBps)) / BPS_SCALE;

  return {
    invoiceValueUsdc: formatUsdcMicros(invoiceValue),
    settlementAssignedUsdc: formatUsdcMicros(settlementAssigned),
    advanceUsdc: formatUsdcMicros(advance),
    settlementReturnUsdc: formatUsdcMicros(settlementAssigned),
    spreadUsdc: formatUsdcMicros(settlementAssigned - advance),
    requestCappedByAvailability: requestedSettlement > escrowAvailable,
  };
}
