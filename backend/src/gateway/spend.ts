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

/// CCTP chain keys (what the rest of the app speaks) -> App Kit chain names for a
/// Gateway spend destination. Only chains proven on the CCTP cash-out path.
export const GATEWAY_DEST_CHAINS: Record<string, string> = {
  baseSepolia: 'Base_Sepolia',
  arbitrumSepolia: 'Arbitrum_Sepolia',
  optimismSepolia: 'Optimism_Sepolia',
  sepolia: 'Ethereum_Sepolia',
  polygonAmoy: 'Polygon_Amoy_Testnet',
};

/// Build the App Kit `unifiedBalance.spend` params for a spend from the user's
/// Gateway EOA (funded on Arc) to a recipient on `destChain` (defaults to Arc).
/// Pure + testable. Single source (Arc), single allocation for the full amount;
/// `useForwarder` so the mint broadcasts without a manual call. Same-chain (Arc)
/// has no Gateway fee; cross-chain adds a 0.005% protocol fee.
export function buildSpendParams(input: {
  adapter: unknown;
  gatewayAddress: string;
  recipientAddress: string;
  amountUsd: number;
  destChain?: string;
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
      chain: input.destChain ?? ARC_APP_KIT_CHAIN,
      recipientAddress: input.recipientAddress,
      useForwarder: true,
    },
  };
}

/// Back-compat alias: an Arc-destination spend (funding an agent).
export function buildArcSpendParams(input: {
  adapter: unknown;
  gatewayAddress: string;
  recipientAddress: string;
  amountUsd: number;
}) {
  return buildSpendParams(input);
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
  const params = buildSpendParams({
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

export interface GatewayCashOutResult {
  destChainKey: string;
  recipientAddress: string;
  amountUsd: number;
  transferId?: string;
}

/// Spend from the user's unified Gateway balance to a recipient on ANOTHER chain
/// (cash out). Cross-chain, so a 0.005% Gateway protocol fee applies on top of
/// gas. `destChainKey` is a CCTP chain key (e.g. 'baseSepolia'); recipient must be
/// a 0x address on that chain. Backend-signed by the Gateway EOA. Throws on
/// insufficient balance / unsupported chain / bad address.
export async function cashOutFromGateway(
  userAddress: string,
  destChainKey: string,
  recipientAddress: string,
  amountUsd: number,
): Promise<GatewayCashOutResult> {
  if (!(amountUsd > 0)) throw new Error('amount must be greater than 0');
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipientAddress)) throw new Error('recipient must be a valid 0x address');
  const destChain = GATEWAY_DEST_CHAINS[destChainKey];
  if (!destChain) throw new Error(`unsupported destination chain: ${destChainKey}`);

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

  const { kit, circleAdapter } = requireAppKit();
  const params = buildSpendParams({
    adapter: circleAdapter,
    gatewayAddress: gw.address,
    recipientAddress: recipientAddress.toLowerCase(),
    amountUsd,
    destChain,
  });
  const result = (await kit.unifiedBalance.spend(params as never)) as { transferId?: string };
  logger.info(
    { userAddress: key, destChainKey, recipientAddress, amountUsd, transferId: result?.transferId },
    'gateway: cashed out from unified balance',
  );
  return { destChainKey, recipientAddress: recipientAddress.toLowerCase(), amountUsd, transferId: result?.transferId };
}
