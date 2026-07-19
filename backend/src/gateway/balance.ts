import { formatUnits } from 'viem';
import { executeContractCall } from '../chain/txs.js';
import { circleWalletsClient, ARC_TESTNET_BLOCKCHAIN } from '../circle/wallets.js';
import { gatewayAvailableUsd } from '../x402/buyerClient.js';
import { getAgentWallets, updateGatewayWallet, type AgentWallets } from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { readUsdcBalance } from '../chain/contracts.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Karwan's unified Gateway balance (autonomy backbone, Stage 2 = deposit + read).
///
/// Each user gets ONE dedicated EOA DCW that OWNS their unified USDC balance,
/// distinct from the internal x402 payment float. Gateway rejects EIP-1271
/// signatures, so the depositor/signer is an EOA — which signs its own burn
/// intents directly, so NO delegate (addDelegate) is needed (that mechanism is
/// only for SCA depositors; Karwan chose the cleaner EOA-depositor path, same as
/// the x402 rail). USDC deposited here forms one balance the backend can later
/// spend to fund agent wallets or cash out, all with no user signature.
///
/// Stage 2 ships DEPOSIT + READ only. Spend (fund agents from this balance) is
/// Stage 3, so this stays UNSURFACED until then — a user must not deposit into a
/// balance they can't yet spend (only the 7-day trustless Gateway withdrawal
/// would get it back).

const GATEWAY_WALLET_ADDR = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const USDC_DECIMALS = 6;

export { gatewayAvailableUsd };

export interface GatewayWalletRef {
  walletId: string;
  address: string;
}

/// In-flight guard so two concurrent deposits for the same user don't provision
/// two Gateway EOAs.
const provisioning = new Map<string, Promise<GatewayWalletRef>>();

async function provisionGatewayWallet(userAddress: string): Promise<GatewayWalletRef> {
  if (!config.CIRCLE_WALLET_SET_ID) {
    throw new Error('CIRCLE_WALLET_SET_ID is not set');
  }
  const client = circleWalletsClient();
  const res = await client.createWallets({
    blockchains: [ARC_TESTNET_BLOCKCHAIN],
    count: 1,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    // EOA on purpose: Gateway rejects EIP-1271, so the owner must recover via
    // plain ecrecover to sign burn intents in Stage 3.
    accountType: 'EOA',
    metadata: [{ name: 'karwan-gateway-balance', refId: userAddress.toLowerCase() }],
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error('gateway wallet provisioning returned incomplete data');
  }
  const ref = { walletId: wallet.id, address: wallet.address.toLowerCase() };
  await updateGatewayWallet(userAddress, ref);
  logger.info({ userAddress, gatewayAddress: ref.address }, 'gateway: unified-balance EOA provisioned');
  return ref;
}

/// Provision (or reuse) the user's unified-balance EOA. Idempotent + concurrency-safe.
export async function ensureGatewayWallet(record: AgentWallets): Promise<GatewayWalletRef> {
  if (record.gatewayWallet) return record.gatewayWallet;
  const key = record.userAddress;
  let pending = provisioning.get(key);
  if (!pending) {
    pending = provisionGatewayWallet(key).finally(() => provisioning.delete(key));
    provisioning.set(key, pending);
  }
  return pending;
}

export interface GatewayDepositResult {
  depositTxHash: string;
  gatewayAddress: string;
  amountUsd: number;
  source: GatewayDepositSource;
}

/// Which of the user's own Circle DCWs the deposited USDC comes from:
///  - 'identity' : the sign-in wallet. Circle (email/passkey) accounts only, since
///                 web3 users self-custody their identity EOA.
///  - 'buyer' / 'seller' : an agent wallet. These are Circle DCWs for EVERY account
///                 type, so this is how a WEB3 user builds a unified balance —
///                 they fund an agent from their own wallet, then move it here.
export type GatewayDepositSource = 'identity' | 'buyer' | 'seller';

/// Resolve the source wallet id + address for a deposit source. Throws a clean,
/// user-facing error when the source isn't available for this account.
async function resolveDepositSource(
  key: string,
  record: AgentWallets,
  source: GatewayDepositSource,
): Promise<{ walletId: string; address: string }> {
  if (source === 'identity') {
    const user = getUserByAddress(key);
    if (!user) {
      throw new Error('depositing from your sign-in wallet is available for email/passkey accounts; a web3 wallet can fund an agent and deposit from there instead');
    }
    return { walletId: user.circleIdentityWalletId, address: key };
  }
  if (source === 'buyer') {
    if (!record.buyerWalletId) throw new Error('no buyer agent wallet on record');
    return { walletId: record.buyerWalletId, address: record.buyerAddress };
  }
  if (!record.sellerWalletId) throw new Error('no seller agent wallet on record');
  return { walletId: record.sellerWalletId, address: record.sellerAddress };
}

/// Deposit USDC from one of the user's own Circle DCWs into their unified Gateway
/// balance. `source` chooses the wallet: 'identity' (Circle accounts) or a
/// 'buyer'/'seller' agent (any account type — the web3 path). One approve + one
/// depositFor crediting the user's Gateway EOA, both on the Arc fast path.
/// Balance-checked up front so an over-deposit returns a clean error, not a
/// silent SCA inner-revert. Throws on any failure.
export async function depositToGateway(
  userAddress: string,
  amountUsd: number,
  source: GatewayDepositSource = 'identity',
): Promise<GatewayDepositResult> {
  if (!(amountUsd > 0)) throw new Error('amount must be greater than 0');
  const key = userAddress.toLowerCase();
  const record = await getAgentWallets(key);
  if (!record) throw new Error('no agent wallets on record; activate first');

  const from = await resolveDepositSource(key, record, source);
  const gateway = await ensureGatewayWallet(record);
  const amountAtomic = BigInt(Math.round(amountUsd * 10 ** USDC_DECIMALS));

  // Preflight: the source wallet must hold the USDC.
  const balance = await readUsdcBalance(from.address);
  if (balance < amountAtomic) {
    const label = source === 'identity' ? 'Your wallet' : `Your ${source} agent`;
    throw new Error(
      `${label} holds ${formatUnits(balance, USDC_DECIMALS)} USDC, less than ${amountUsd}. Lower the amount and try again.`,
    );
  }

  // Approve the Gateway Wallet to pull USDC from the source wallet, then
  // depositFor crediting the user's Gateway EOA as the unified-balance depositor.
  await executeContractCall(
    {
      walletId: from.walletId,
      contractAddress: config.USDC_ADDR,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [GATEWAY_WALLET_ADDR, amountAtomic.toString()],
    },
    'gateway.deposit.approve',
  );
  const deposit = await executeContractCall(
    {
      walletId: from.walletId,
      contractAddress: GATEWAY_WALLET_ADDR,
      abiFunctionSignature: 'depositFor(address,address,uint256)',
      abiParameters: [config.USDC_ADDR, gateway.address, amountAtomic.toString()],
    },
    'gateway.deposit.depositFor',
  );

  logger.info(
    { userAddress: key, gatewayAddress: gateway.address, amountUsd, source, depositTx: deposit.txHash },
    'gateway: deposited into unified balance',
  );
  return { depositTxHash: deposit.txHash, gatewayAddress: gateway.address, amountUsd, source };
}

/// Sweep loose USDC from the user's identity wallet into their unified Gateway
/// balance. This is the "into the unified balance" step for a Solana (or any)
/// top-up: the bridge mints native USDC to the identity wallet (which has Arc
/// gas), then this deposits it into the Gateway pool. Self-healing + idempotent:
/// if a top-up landed but wasn't deposited (async hook missed, tab closed), a
/// later sweep recovers it. Deposits the FULL current identity USDC balance.
/// Circle-only (the identity DCW signs). Returns the swept amount (0 if nothing
/// to sweep). Reuses depositToGateway, so no new gas surface.
export async function sweepToUnifiedBalance(
  userAddress: string,
): Promise<{ swept: number; gatewayAddress: string | null }> {
  const key = userAddress.toLowerCase();
  const record = await getAgentWallets(key);
  if (!record) throw new Error('no agent wallets on record; activate first');
  if (!getUserByAddress(key)) {
    throw new Error('sweeping into your unified balance is available for email/passkey accounts');
  }
  const balWei = await readUsdcBalance(key);
  const balUsd = Number(formatUnits(balWei, USDC_DECIMALS));
  if (balUsd <= 0) return { swept: 0, gatewayAddress: record.gatewayWallet?.address ?? null };
  const res = await depositToGateway(userAddress, balUsd, 'identity');
  return { swept: balUsd, gatewayAddress: res.gatewayAddress };
}

/// Read the user's unified Gateway balance (available USD on Arc), or null when
/// they have no Gateway EOA yet (never deposited).
export async function readUserGatewayBalance(
  userAddress: string,
): Promise<{ available: number; gatewayAddress: string } | null> {
  const record = await getAgentWallets(userAddress.toLowerCase());
  const gw = record?.gatewayWallet;
  if (!gw) return null;
  const available = await gatewayAvailableUsd(gw.address);
  return { available, gatewayAddress: gw.address };
}
