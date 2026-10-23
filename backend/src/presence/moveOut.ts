import type { Context } from 'hono';
import type { Outgoing } from '../moneyOut/guard.js';
import { isOwnArcWallet } from '../moneyOut/live.js';
import { presenceAction } from './action.js';
import { requirePresence } from './live.js';

/// Money leaving Karwan's wallets for the person asks them to confirm; a move
/// between their own Karwan wallets on Arc does not.
export async function confirmMoveOut(c: Context, outgoing: Outgoing, detail: Record<string, string> = {}): Promise<Response | null> {
  if (outgoing.exit.kind !== 'payout') return null;
  const { chain, address } = outgoing.exit;
  if (chain === 'arc' && (await isOwnArcWallet(outgoing.wallet, address))) return null;
  return requirePresence(
    c,
    presenceAction({
      kind: 'move_out',
      wallet: outgoing.wallet,
      amountMicros: outgoing.amountMicros.toString(),
      recipient: address,
      detail: { chain, ...detail },
    }),
  );
}
