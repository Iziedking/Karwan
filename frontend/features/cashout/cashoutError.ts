import { ApiError } from '@/core/api';

export type CashoutErrorKey = 'notEnough' | 'walletUnavailable' | 'busy' | 'notSettled' | 'failed';

/// The line the cash-out screen shows for a refusal from
/// backend/src/routes/cashout.ts. Money-out guard refusals are handled before
/// this, by MoneyOutNotice.
export function cashoutErrorKey(err: unknown): CashoutErrorKey {
  if (!(err instanceof ApiError)) return 'failed';
  switch (err.code) {
    case 'INSUFFICIENT_BALANCE':
      return 'notEnough';
    case 'NO_DEAL_WALLET':
    case 'NO_BUYER_WALLET':
    case 'WALLET_ACCOUNT':
      return 'walletUnavailable';
    case 'WITHDRAW_IN_PROGRESS':
      return 'busy';
    case 'NOT_SETTLED':
      return 'notSettled';
    default:
      return 'failed';
  }
}
