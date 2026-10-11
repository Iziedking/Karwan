import { formatUnits } from 'viem';

const DAY = 86_400_000;

/// A confirmed deletion runs this long after the tap, so someone holding a
/// stolen phone cannot erase a record at once, and the owner can cancel.
export const WAIT_MS = 7 * DAY;
/// The one-way hash of the person's World ID outlives the account this long,
/// so the same person cannot delete and come back with a clean record.
export const NULLIFIER_KEEP_MS = 365 * DAY;
/// Below a cent in a wallet is dust and does not stop a deletion.
export const DUST_MICROS = 10_000n;

/// What the account still has going on, read just before a deletion is
/// scheduled and again before it runs. `micros` is null when a balance could
/// not be read.
export interface Standing {
  openDeals: number;
  liveOffers: number;
  openRequests: number;
  activeBids: number;
  holdings: { where: string; micros: bigint | null }[];
}

export type RefusalCode = 'open_deal' | 'live_market' | 'agent_bidding' | 'balance' | 'unreadable';

const AGAIN = 'then send /delete again.';

/// Why the account cannot be deleted yet, or null when it can.
export function refusalFor(s: Standing): { code: RefusalCode; message: string } | null {
  if (s.openDeals > 0) return { code: 'open_deal', message: `You have an open deal. Finish or cancel it first, ${AGAIN}` };
  if (s.liveOffers > 0 || s.openRequests > 0) {
    return { code: 'live_market', message: `You have offers or requests still live. Take them down first, ${AGAIN}` };
  }
  if (s.activeBids > 0) return { code: 'agent_bidding', message: 'Your agent is still bidding on a request. Send /delete again when that ends.' };

  const held = s.holdings.reduce((sum, h) => sum + (h.micros !== null && h.micros >= DUST_MICROS ? h.micros : 0n), 0n);
  if (held > 0n) {
    const amount = Number(formatUnits(held, 6)).toFixed(2);
    return { code: 'balance', message: `You still hold ${amount} USDC. Withdraw it first, ${AGAIN}` };
  }
  if (s.holdings.some((h) => h.micros === null)) {
    return { code: 'unreadable', message: "I couldn't check your balances just now. Try again in a few minutes." };
  }
  return null;
}

/// The chat command that starts a deletion. Telegram adds the bot's name to a
/// command picked from its menu.
export function isDeleteCommand(text: string | undefined): boolean {
  return /^\/delete(@\w+)?$/i.test(text?.trim() ?? '');
}
