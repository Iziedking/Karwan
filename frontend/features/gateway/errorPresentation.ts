import type { Messages } from '@/shared/i18n/messages/en';
import { chainErrorMessage } from '@/shared/utils/chainError';

// Circle's forwarding fee is currently a small fixed charge plus destination
// gas. If the displayed pool exceeds the requested amount by several USDC, a
// maxFee rejection is an estimate/preparation failure—not evidence that the
// user should keep shaving a clearly covered transfer.
const CLEAR_FEE_HEADROOM_USDC = 5;

function rawMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
}

export function isGatewayFeeReservationError(err: unknown): boolean {
  const raw = rawMessage(err);
  return (
    raw.includes('maxfee') ||
    raw.includes('forwarding fee') ||
    raw.includes('required additional')
  );
}

export function gatewayTopUpErrorPresentation(input: {
  err: unknown;
  confirmed: number;
  amount: number;
  chainCopy: Messages['chainErrors'];
  fallback: string;
  feePreparationFailed: string;
}): { message: string; refreshBalance: boolean } {
  const clearHeadroom = input.confirmed - input.amount >= CLEAR_FEE_HEADROOM_USDC;
  if (clearHeadroom && isGatewayFeeReservationError(input.err)) {
    return { message: input.feePreparationFailed, refreshBalance: true };
  }
  return {
    message: chainErrorMessage(input.err, input.chainCopy, input.fallback),
    refreshBalance: false,
  };
}
