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
}

/// Deposit USDC from the user's identity DCW into their unified Gateway balance.
/// Circle-only: the backend signs the identity SCA, so this is unavailable to
/// web3 users (their identity is a self-custodied EOA). One approve + one
/// depositFor crediting the user's Gateway EOA, both on the Arc fast path.
/// Balance-checked up front so an over-deposit returns a clean error, not a
/// silent SCA inner-revert. Throws on any failure.
export async function depositIdentityToGateway(
  userAddress: string,
  amountUsd: number,
): Promise<GatewayDepositResult> {
  if (!(amountUsd > 0)) throw new Error('amount must be greater than 0');
  const key = userAddress.toLowerCase();
  const record = await getAgentWallets(key);
  if (!record) throw new Error('no agent wallets on record; activate first');
  const user = getUserByAddress(key);
  if (!user) {
    throw new Error('depositing from your identity wallet is available for email/passkey accounts only');
  }

  const gateway = await ensureGatewayWallet(record);
  const amountAtomic = BigInt(Math.round(amountUsd * 10 ** USDC_DECIMALS));

  // Preflight: the identity wallet must hold the USDC. Its address IS the user's
  // session/identity address for Circle accounts.
  const balance = await readUsdcBalance(key);
  if (balance < amountAtomic) {
    throw new Error(
      `Your wallet holds ${formatUnits(balance, USDC_DECIMALS)} USDC, less than ${amountUsd}. Lower the amount and try again.`,
    );
  }

  // Approve the Gateway Wallet to pull USDC from the identity wallet, then
  // depositFor crediting the user's Gateway EOA as the unified-balance depositor.
  await executeContractCall(
    {
      walletId: user.circleIdentityWalletId,
      contractAddress: config.USDC_ADDR,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [GATEWAY_WALLET_ADDR, amountAtomic.toString()],
    },
    'gateway.deposit.approve',
  );
  const deposit = await executeContractCall(
    {
      walletId: user.circleIdentityWalletId,
      contractAddress: GATEWAY_WALLET_ADDR,
      abiFunctionSignature: 'depositFor(address,address,uint256)',
      abiParameters: [config.USDC_ADDR, gateway.address, amountAtomic.toString()],
    },
    'gateway.deposit.depositFor',
  );

  logger.info(
    { userAddress: key, gatewayAddress: gateway.address, amountUsd, depositTx: deposit.txHash },
    'gateway: deposited into unified balance',
  );
  return { depositTxHash: deposit.txHash, gatewayAddress: gateway.address, amountUsd };
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
