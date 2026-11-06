import { ESCROW_STATE } from '../chain/contracts.js';

/// The two desk rules that guard money directly (view 64, audit RT-26, RT-30).

export type Verdict = { ok: true } | { ok: false; code: string; message: string };

const HOLDS_MONEY = new Set<number>([ESCROW_STATE.Funded, ESCROW_STATE.Accepted, ESCROW_STATE.Disputed]);

/// Force-cancel closes a deal off chain. It is allowed only when the escrow
/// holds nothing: never funded, or read back as empty, settled or refunded.
export function forceCancelVerdict(input: { everFunded: boolean; escrow: { state: number } | 'unreadable' | null }): Verdict {
  if (!input.everFunded) return { ok: true };
  if (input.escrow === 'unreadable' || input.escrow === null) {
    return { ok: false, code: 'ESCROW_UNREADABLE', message: 'The escrow could not be read, so the deal is not closed. Try again when the chain answers.' };
  }
  if (HOLDS_MONEY.has(input.escrow.state)) {
    return { ok: false, code: 'ESCROW_HOLDS_MONEY', message: 'The escrow still holds money for this deal. Release, refund or rule it on chain first.' };
  }
  return { ok: true };
}

/// Reset-history deletes a person's records. It needs the address typed again
/// and never runs on mainnet.
export function resetHistoryVerdict(input: { address: string; confirm: unknown; network: 'testnet' | 'mainnet' }): Verdict {
  if (input.network === 'mainnet') return { ok: false, code: 'MAINNET', message: 'Reset-history does not run on mainnet.' };
  if (typeof input.confirm !== 'string' || input.confirm.trim().toLowerCase() !== input.address.toLowerCase()) {
    return { ok: false, code: 'CONFIRM_ADDRESS', message: 'Type the address again in confirm to reset its history.' };
  }
  return { ok: true };
}
