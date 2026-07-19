import { requireAppKit } from '../chain/appKit.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { gatewayAvailableUsd } from '../x402/buyerClient.js';
import { logger } from '../logger.js';

/// Karwan's unified Gateway balance — SPEND side (autonomy Stage 3).
///
/// The user's Gateway EOA signs a burn intent (via the Circle Wallets adapter,
/// which produces a plain ECDSA signature Gateway accepts) and Gateway mints USDC
/// to a recipient. The EOA is BOTH the depositor (`sourceAccount`) and the signer
/// (`address`) — so no delegate is needed; an EOA signs its own burn intents.
///
/// Funding an agent is a SAME-CHAIN spend (Arc -> Arc): the Gateway protocol fee
/// is 0 (fee applies only to cross-chain spends), so it costs only Arc gas. The
/// agent wallets are Circle DCWs, so this is fully backend-signed for every
/// account type. App Kit builds the burn intent, signs it, submits it, and the
/// forwarder broadcasts the mint — no manual mint call.

const ARC_APP_KIT_CHAIN = 'Arc_Testnet';

/// Build the App Kit `unifiedBalance.spend` params for a same-chain Arc spend from
/// the user's Gateway EOA to a recipient. Pure + testable. Single source (Arc),
/// single allocation for the full amount; `useForwarder` so the mint broadcasts
/// without a manual call.
export function buildArcSpendParams(input: {
  adapter: unknown;
  gatewayAddress: string;
  recipientAddress: string;
  amountUsd: number;
}) {
  const amount = input.amountUsd.toString();
  return {
    amount,
    token: 'USDC' as const,
    from: [
      {
        adapter: input.adapter,
        address: input.gatewayAddress,
        // Depositor whose balance is spent == the signer, since the EOA owns its
        // own Gateway deposit. No delegate.
        sourceAccount: input.gatewayAddress,
        allocations: [{ amount, chain: ARC_APP_KIT_CHAIN }],
      },
    ],
    to: {
      chain: ARC_APP_KIT_CHAIN,
      recipientAddress: input.recipientAddress,
      useForwarder: true,
    },
  };
}

export interface FundAgentResult {
  agent: 'buyer' | 'seller';
  recipientAddress: string;
  amountUsd: number;
  transferId?: string;
}

/// Spend from the user's unified Gateway balance to fund one of their agent
/// wallets on Arc. Requires an already-funded balance (Stage 2 deposit). Throws
/// on any failure, including an insufficient balance (checked up front so the
/// caller gets a clean message, not a raw Gateway error).
export async function fundAgentFromGateway(
  userAddress: string,
  agent: 'buyer' | 'seller',
  amountUsd: number,
): Promise<FundAgentResult> {
  if (!(amountUsd > 0)) throw new Error('amount must be greater than 0');
  const key = userAddress.toLowerCase();
  const record = await getAgentWallets(key);
  if (!record) throw new Error('no agent wallets on record; activate first');
  const gw = record.gatewayWallet;
  if (!gw) throw new Error('you have no unified balance yet; add money to it first');

  const available = await gatewayAvailableUsd(gw.address);
  if (available < amountUsd) {
    throw new Error(
      `Your unified balance is ${available.toFixed(2)} USDC, less than ${amountUsd}. Add money first or lower the amount.`,
    );
  }

  const recipientAddress = agent === 'buyer' ? record.buyerAddress : record.sellerAddress;
  const { kit, circleAdapter } = requireAppKit();
  const params = buildArcSpendParams({
    adapter: circleAdapter,
    gatewayAddress: gw.address,
    recipientAddress,
    amountUsd,
  });
  const result = (await kit.unifiedBalance.spend(params as never)) as { transferId?: string };
  logger.info(
    { userAddress: key, agent, recipientAddress, amountUsd, transferId: result?.transferId },
    'gateway: funded agent from unified balance',
  );
  return { agent, recipientAddress, amountUsd, transferId: result?.transferId };
}
