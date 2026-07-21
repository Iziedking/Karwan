import { formatUnits } from 'viem';
import { readUsdcBalance } from '../chain/contracts.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { gatewayAvailableUsd } from '../x402/buyerClient.js';
import { GATEWAY_DEST_CHAINS } from './spend.js';

/// Where a user's spendable USDC actually sits, and which rail to move it on.
///
/// The user has ONE wallet and ONE balance as far as the product is concerned.
/// Underneath, that money can be in two places: their Arc identity wallet, or
/// their unified Gateway balance. Which one is an implementation detail they
/// should never have to hold in their head, so nothing here is user-facing — the
/// assistant and the UI ask for a total and an amount, and this picks the rail.
///
/// The unified balance is never presented, never deposited into on request, and
/// never named in copy. It exists, it counts toward the total, and it drains
/// first on the paths where it is genuinely faster.

const USDC_DECIMALS = 6;

export interface Spendable {
  /// Liquid USDC in the Arc identity wallet.
  walletUsd: number;
  /// USDC locked in the Gateway pool, spendable to any supported chain.
  unifiedUsd: number;
  /// What the user is told they have. The only number that should reach copy.
  totalUsd: number;
}

/// Read both pockets at once. A missing Gateway EOA reads as 0 rather than
/// throwing: most users never have one, and that is not an error condition.
export async function readSpendable(userAddress: string): Promise<Spendable> {
  const key = userAddress.toLowerCase();
  const [walletWei, record] = await Promise.all([readUsdcBalance(key), getAgentWallets(key)]);
  const walletUsd = Number(formatUnits(walletWei, USDC_DECIMALS));

  let unifiedUsd = 0;
  const gw = record?.gatewayWallet;
  if (gw) {
    try {
      unifiedUsd = await gatewayAvailableUsd(gw.address);
    } catch {
      // A Gateway API blip must not blank a balance the user can see. Report the
      // wallet alone rather than failing the whole read.
      unifiedUsd = 0;
    }
  }
  return { walletUsd, unifiedUsd, totalUsd: walletUsd + unifiedUsd };
}

/// 'wallet' moves USDC straight from the identity wallet. 'unified' spends the
/// Gateway balance. 'insufficient' means neither pocket covers the amount on its
/// own, so the caller reports the total instead of attempting a two-leg move.
export type SpendRoute = 'wallet' | 'unified' | 'insufficient';

/// Pick the rail for an amount.
///
/// `prefer` decides which pocket gets asked first, and the two callers want
/// opposite things. Funding an agent stays on Arc, so the wallet is the cheaper,
/// simpler hop and goes first. Cashing out crosses chains, where a Gateway spend
/// settles in under a second against CCTP's several minutes, so there the
/// unified balance goes first and the speed is a free win the user never has to
/// ask for.
///
/// Deliberately never splits across both pockets: two transactions means two
/// failure modes and a half-moved amount to explain. If neither covers it, say
/// so with the total and let the user pick a number that works.
export function pickRoute(
  s: Spendable,
  amountUsd: number,
  prefer: 'wallet' | 'unified',
): SpendRoute {
  const first = prefer === 'wallet' ? s.walletUsd : s.unifiedUsd;
  const second = prefer === 'wallet' ? s.unifiedUsd : s.walletUsd;
  if (first >= amountUsd) return prefer;
  if (second >= amountUsd) return prefer === 'wallet' ? 'unified' : 'wallet';
  return 'insufficient';
}

/// Gateway spend supports a fixed set of EVM destinations. Solana is reachable
/// by CCTP only (an Arc->Solana Gateway spend needs recipient-ATA handling we
/// have not proven), so a Solana cash-out always takes the wallet rail.
export function gatewayCanReach(destChainKey: string): boolean {
  return destChainKey in GATEWAY_DEST_CHAINS;
}

/// The message for the model when no single rail covers the amount.
///
/// Two different situations reach here and they must not be described the same
/// way. Usually the total really is short. But because a move never splits
/// across both pockets, the total CAN cover the amount while neither pocket does
/// on its own — and telling someone holding 110 that they have "less than 100"
/// is a lie they can see through. In that case name the largest single amount
/// that will actually go through.
export function insufficientMessage(s: Spendable, amountUsd: number): string {
  if (s.totalUsd >= amountUsd) {
    const most = Math.max(s.walletUsd, s.unifiedUsd);
    return `They hold ${s.totalUsd.toFixed(2)} USDC but the most that can move in one go right now is ${most.toFixed(2)}. Offer to move ${most.toFixed(2)} instead, or to do it in two steps.`;
  }
  return `They have ${s.totalUsd.toFixed(2)} USDC, less than the ${amountUsd} they asked to move. Tell them the real balance and offer to add money.`;
}
