import { formatUnits, parseUnits } from 'viem';
import { USDC_DECIMALS } from '../deals/fundingQuote.js';

/// Gas on Arc is USDC and a deal costs a handful of transactions.
export const GAS_HEADROOM_USDC = '0.5';

export interface FundingNeedView {
  requiredUsdc: string;
  balanceUsdc: string;
  topUpNeededUsdc: string;
}

/// What the buyer agent must hold before a request goes up: the amount the
/// escrow pulls when a seller accepts (deal plus the buyer's half of the fee,
/// KarwanEscrow.fundEscrow arithmetic) plus gas headroom. The quote route and
/// the post check both call this, so the number shown is the number enforced.
export function buyerFundingNeed(input: {
  budgetUsdc: number | string;
  feeBps: number;
  balanceWei: bigint;
}): { required: bigint; shortfall: bigint; view: FundingNeedView } {
  const deal = parseUnits(String(input.budgetUsdc), USDC_DECIMALS);
  const feeTotal = (deal * BigInt(input.feeBps)) / 10_000n;
  const required = deal + feeTotal / 2n + parseUnits(GAS_HEADROOM_USDC, USDC_DECIMALS);
  const shortfall = input.balanceWei >= required ? 0n : required - input.balanceWei;
  return {
    required,
    shortfall,
    view: {
      requiredUsdc: formatUnits(required, USDC_DECIMALS),
      balanceUsdc: formatUnits(input.balanceWei, USDC_DECIMALS),
      topUpNeededUsdc: formatUnits(shortfall, USDC_DECIMALS),
    },
  };
}
