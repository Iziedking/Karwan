import { randomUUID } from 'node:crypto';
import { requireAppKit } from '../chain/appKit.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { gatewayAvailableUsd } from '../x402/buyerClient.js';
import { createBridge } from '../db/bridges.js';
import { ARC_DOMAIN, type CctpChainKey } from '../chain/cctpChains.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import {
  ensureGatewaySpendMovement,
  prepareGatewaySpendMovement,
} from '../money/gateway.js';
import {
  currentMoneyMovement,
  markMoneyMovementNeedsAttention,
} from '../money/service.js';
import { recordCashoutLeg } from '../money/cashout.js';
import { parseUsdcMicros, type MoneyMovement } from '../money/model.js';

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

/// What App Kit hands back from a spend. `txHash` is the MINED destination
/// transaction and is the receipt worth showing; `transferId` is a Circle
/// internal reference that resolves on no block explorer. Reading only the
/// latter is why a pooled-balance move used to end with an unverifiable string.
interface SpendOutcome {
  txHash?: string;
  explorerUrl?: string;
  transferId?: string;
  steps?: Array<{
    name?: string;
    state?: string;
    txHash?: string;
    explorerUrl?: string;
  }>;
}

export class GatewaySpendError extends Error {
  constructor(
    message: string,
    readonly reference: string,
    readonly movementState: MoneyMovement['state'],
  ) {
    super(message);
    this.name = 'GatewaySpendError';
  }
}

export interface FundAgentResult {
  agent: 'buyer' | 'seller';
  recipientAddress: string;
  amountUsd: number;
  txHash?: string;
  explorerUrl?: string;
  transferId?: string;
  reference: string;
  movementState: MoneyMovement['state'];
}

/// Spend from the user's unified Gateway balance to fund one of their agent
/// wallets on Arc. Requires an already-funded balance (Stage 2 deposit). Throws
/// on any failure, including an insufficient balance (checked up front so the
/// caller gets a clean message, not a raw Gateway error).
export async function fundAgentFromGateway(
  userAddress: string,
  agent: 'buyer' | 'seller',
  amountUsd: number,
  requestId?: string,
): Promise<FundAgentResult> {
  if (!(amountUsd > 0)) throw new Error('amount must be greater than 0');
  const key = userAddress.toLowerCase();
  const record = await getAgentWallets(key);
  if (!record) throw new Error('no agent wallets on record; activate first');
  const gw = record.gatewayWallet;
  if (!gw) throw new Error('you have no unified balance yet; add money to it first');

  const recipientAddress = agent === 'buyer' ? record.buyerAddress : record.sellerAddress;
  const operationKey = `gateway:agent-funding:${key}:${agent}:${requestId ?? randomUUID()}`;
  const ensured = await ensureGatewaySpendMovement({
    operationKey,
    kind: 'agent_funding',
    amountUsdc: amountUsd.toString(),
    initiatedBy: key,
    sourceAddress: gw.address,
    destinationAddress: recipientAddress,
    summary: `Funded the ${agent} agent with ${amountUsd} USDC`,
  });
  const existing = await currentMoneyMovement(ensured.movement.reference);
  const existingLeg = existing.legs.find(
    (leg) => leg.attempt === existing.attempt && leg.key === 'gateway_mint',
  );
  if (
    existing.state === 'completed' ||
    existing.state === 'needs_attention' ||
    existingLeg?.providerId
  ) {
    return {
      agent,
      recipientAddress,
      amountUsd,
      ...(existingLeg?.txHash ? { txHash: existingLeg.txHash } : {}),
      ...(existingLeg?.explorerUrl ? { explorerUrl: existingLeg.explorerUrl } : {}),
      ...(existingLeg?.providerId ? { transferId: existingLeg.providerId } : {}),
      reference: existing.reference,
      movementState: existing.state,
    };
  }
  const available = await gatewayAvailableUsd(gw.address);
  if (available < amountUsd) {
    throw new Error(
      `Your unified balance is ${available.toFixed(2)} USDC, less than ${amountUsd}. Add money first or lower the amount.`,
    );
  }
  await prepareGatewaySpendMovement(ensured.movement.reference, {
    sourceAddress: gw.address,
    destinationAddress: recipientAddress,
    amountMicros: parseUsdcMicros(amountUsd.toString()),
    destinationChain: ARC_APP_KIT_CHAIN,
  });
  const { kit, circleAdapter } = requireAppKit();
  const params = buildSpendParams({
    adapter: circleAdapter,
    gatewayAddress: gw.address,
    recipientAddress,
    amountUsd,
  });
  let result: SpendOutcome;
  try {
    result = (await kit.unifiedBalance.spend(params as never)) as SpendOutcome;
  } catch (error) {
    // An SDK error can occur after Gateway has accepted the intent. Preserve
    // the current attempt for reconciliation instead of marking the leg
    // terminal and making a blind retry that could spend twice.
    const attention = await markMoneyMovementNeedsAttention(
      ensured.movement.reference,
      'GATEWAY_SPEND_UNKNOWN_OUTCOME',
    );
    throw new GatewaySpendError(
      error instanceof Error ? error.message : 'Gateway spend outcome is unknown',
      attention.reference,
      attention.state,
    );
  }
  const mintStep = result.steps?.find((step) => step.name === 'mint' && step.state === 'success');
  const effectiveTxHash = result.txHash ?? mintStep?.txHash;
  const effectiveExplorerUrl = result.explorerUrl ?? mintStep?.explorerUrl;
  let finalized: MoneyMovement;
  try {
    finalized = await recordCashoutLeg(ensured.movement.reference, 'gateway_mint', {
      submitted: true,
      ...(result.transferId ? { providerId: result.transferId } : {}),
      ...(effectiveTxHash ? { txHash: effectiveTxHash } : {}),
      ...(effectiveExplorerUrl ? { explorerUrl: effectiveExplorerUrl } : {}),
    });
  } catch (error) {
    const failed = await markMoneyMovementNeedsAttention(
      ensured.movement.reference,
      'GATEWAY_RECEIPT_PERSIST_FAILED',
    );
    throw new GatewaySpendError(
      error instanceof Error ? error.message : 'Could not persist Gateway receipt',
      failed.reference,
      failed.state,
    );
  }
  logger.info(
    { userAddress: key, agent, recipientAddress, amountUsd, txHash: effectiveTxHash },
    'gateway: funded agent from unified balance',
  );
  // The same event the direct wallet-to-agent path emits, keyed on `user` so
  // the SSE projection recognises it as this caller's own money and delivers
  // the payload intact instead of an empty pulse.
  bus.emitEvent({
    type: 'agent.funded',
    actor: 'buyer',
    payload: {
      user: key,
      agent,
      address: recipientAddress,
      amountUsdc: amountUsd.toString(),
      reference: finalized.reference,
      movementState: finalized.state,
      ...(effectiveTxHash ? { txHash: effectiveTxHash } : {}),
    },
  });
  return {
    agent,
    recipientAddress,
    amountUsd,
    ...(effectiveTxHash ? { txHash: effectiveTxHash } : {}),
    ...(effectiveExplorerUrl ? { explorerUrl: effectiveExplorerUrl } : {}),
    transferId: result?.transferId,
    reference: finalized.reference,
    movementState: finalized.state,
  };
}

export interface GatewayCashOutResult {
  destChainKey: string;
  recipientAddress: string;
  amountUsd: number;
  txHash?: string;
  explorerUrl?: string;
  transferId?: string;
  reference: string;
  movementState: MoneyMovement['state'];
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
  requestId?: string,
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

  const operationKey = `gateway:cash-out:${key}:${destChainKey}:${recipientAddress.toLowerCase()}:${requestId ?? randomUUID()}`;
  const ensured = await ensureGatewaySpendMovement({
    operationKey,
    kind: 'cash_out',
    amountUsdc: amountUsd.toString(),
    initiatedBy: key,
    sourceAddress: gw.address,
    destinationAddress: recipientAddress,
    summary: `Cashed out ${amountUsd} USDC to another chain`,
  });
  const existing = await currentMoneyMovement(ensured.movement.reference);
  const existingLeg = existing.legs.find(
    (leg) => leg.attempt === existing.attempt && leg.key === 'gateway_mint',
  );
  if (
    existing.state === 'completed' ||
    existing.state === 'needs_attention' ||
    existingLeg?.providerId
  ) {
    return {
      destChainKey,
      recipientAddress: recipientAddress.toLowerCase(),
      amountUsd,
      ...(existingLeg?.txHash ? { txHash: existingLeg.txHash } : {}),
      ...(existingLeg?.explorerUrl ? { explorerUrl: existingLeg.explorerUrl } : {}),
      ...(existingLeg?.providerId ? { transferId: existingLeg.providerId } : {}),
      reference: existing.reference,
      movementState: existing.state,
    };
  }
  const available = await gatewayAvailableUsd(gw.address);
  if (available < amountUsd) {
    throw new Error(
      `Your unified balance is ${available.toFixed(2)} USDC, less than ${amountUsd}. Add money first or lower the amount.`,
    );
  }
  await prepareGatewaySpendMovement(ensured.movement.reference, {
    sourceAddress: gw.address,
    destinationAddress: recipientAddress,
    amountMicros: parseUsdcMicros(amountUsd.toString()),
    destinationChain: destChain,
  });

  const { kit, circleAdapter } = requireAppKit();
  const params = buildSpendParams({
    adapter: circleAdapter,
    gatewayAddress: gw.address,
    recipientAddress: recipientAddress.toLowerCase(),
    amountUsd,
    destChain,
  });
  let result: SpendOutcome;
  try {
    result = (await kit.unifiedBalance.spend(params as never)) as SpendOutcome;
  } catch (error) {
    const attention = await markMoneyMovementNeedsAttention(
      ensured.movement.reference,
      'GATEWAY_SPEND_UNKNOWN_OUTCOME',
    );
    throw new GatewaySpendError(
      error instanceof Error ? error.message : 'Gateway spend outcome is unknown',
      attention.reference,
      attention.state,
    );
  }
  const mintStep = result.steps?.find((step) => step.name === 'mint' && step.state === 'success');
  const effectiveTxHash = result.txHash ?? mintStep?.txHash;
  const effectiveExplorerUrl = result.explorerUrl ?? mintStep?.explorerUrl;
  let finalized: MoneyMovement;
  try {
    finalized = await recordCashoutLeg(ensured.movement.reference, 'gateway_mint', {
      submitted: true,
      ...(result.transferId ? { providerId: result.transferId } : {}),
      ...(effectiveTxHash ? { txHash: effectiveTxHash } : {}),
      ...(effectiveExplorerUrl ? { explorerUrl: effectiveExplorerUrl } : {}),
    });
  } catch (error) {
    const failed = await markMoneyMovementNeedsAttention(
      ensured.movement.reference,
      'GATEWAY_RECEIPT_PERSIST_FAILED',
    );
    throw new GatewaySpendError(
      error instanceof Error ? error.message : 'Could not persist Gateway receipt',
      failed.reference,
      failed.state,
    );
  }
  const dest = recipientAddress.toLowerCase();
  logger.info(
    { userAddress: key, destChainKey, recipientAddress: dest, amountUsd, txHash: result?.txHash },
    'gateway: cashed out from unified balance',
  );

  // A pooled cash-out IS a cross-chain transfer, so it belongs in the same
  // history as every other one. Without this record it existed nowhere the user
  // could look, while the assistant offered a "Track it" button pointing at
  // /bridge — a page built from bridge records, and therefore guaranteed to be
  // empty. Written terminal because App Kit resolves once the destination
  // transaction is mined.
  try {
    await createBridge({
      bridgeId: `gateway-out-${key}-${result?.transferId ?? result?.txHash ?? Date.now()}`,
      movementReference: finalized.reference,
      direction: 'out',
      owner: key,
      sourceDomain: ARC_DOMAIN,
      sourceTxHash: '',
      amountUsdc: amountUsd.toString(),
      mintRecipient: dest,
      destChainKey: destChainKey as CctpChainKey,
      status: effectiveTxHash ? 'minted' : 'relaying',
      ...(effectiveTxHash ? { mintTxHash: effectiveTxHash } : {}),
      appKit: true,
    });
  } catch (err) {
    // History is not worth failing a completed transfer over. The money has
    // moved; log loudly and still return the receipt.
    logger.error(
      { userAddress: key, destChainKey, err: (err as Error).message },
      'gateway: cash-out succeeded but history record failed',
    );
  }

  // A provider transfer id is correlation metadata, not network proof. Keep
  // the bridge projection and the Gateway-specific event visible while the
  // movement is pending, but do not emit the terminal `bridge.minted` event
  // until the destination leg has a verified transaction hash.
  if (finalized.state === 'completed') {
    bus.emitEvent({
      type: 'bridge.minted',
      actor: 'buyer',
      payload: {
        owner: key,
        destChainKey,
        amountUsdc: amountUsd.toString(),
        mintRecipient: dest,
        ...(effectiveTxHash ? { txHash: effectiveTxHash } : {}),
        reference: finalized.reference,
        movementState: finalized.state,
        circle: true,
        appKit: true,
      },
    });
  }

  return {
    destChainKey,
    recipientAddress: dest,
    amountUsd,
    ...(effectiveTxHash ? { txHash: effectiveTxHash } : {}),
    ...(effectiveExplorerUrl ? { explorerUrl: effectiveExplorerUrl } : {}),
    transferId: result?.transferId,
    reference: finalized.reference,
    movementState: finalized.state,
  };
}
