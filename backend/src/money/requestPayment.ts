/// Marks a payment request paid from what the chain says, not from what the
/// payer's browser says. The payer reports a transaction hash on Arc; the
/// receipt must hold a USDC transfer to the request's recipient for the amount.
/// A cross-chain payment arrives as a mint with the transfer fees taken out, so
/// a mint may fall short by the fee allowance; a direct Arc transfer may not.

import { decodeEventLog, erc20Abi, type Log } from 'viem';
import { usdcToMicros } from './depositRequests.js';

const ZERO = '0x0000000000000000000000000000000000000000';
/// Circle's fast fee plus forwarding fee, with room to spare: 0.25 USDC and
/// 0.2% of the amount.
const FEE_FLOOR_MICROS = 250_000n;
const FEE_BPS = 20n;

export interface ReceivedTransfer {
  micros: bigint;
  minted: boolean;
}

/// Every USDC transfer to the recipient in one receipt, summed.
export function receivedBy(logs: readonly Pick<Log, 'address' | 'data' | 'topics'>[], usdc: string, recipient: string): ReceivedTransfer {
  let micros = 0n;
  let minted = false;
  for (const log of logs) {
    if (log.address.toLowerCase() !== usdc.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] });
      if (event.eventName !== 'Transfer') continue;
      const { from, to, value } = event.args as { from: string; to: string; value: bigint };
      if (to.toLowerCase() !== recipient.toLowerCase()) continue;
      micros += value;
      if (from.toLowerCase() === ZERO) minted = true;
    } catch {
      // Not a Transfer this ABI knows.
    }
  }
  return { micros, minted };
}

export function coversRequest(received: ReceivedTransfer, amountUsdc: string | null): boolean {
  if (received.micros <= 0n) return false;
  if (!amountUsdc) return true;
  const asked = usdcToMicros(amountUsdc);
  if (received.micros >= asked) return true;
  if (!received.minted) return false;
  const allowance = FEE_FLOOR_MICROS + (asked * FEE_BPS) / 10_000n;
  return received.micros + allowance >= asked;
}
