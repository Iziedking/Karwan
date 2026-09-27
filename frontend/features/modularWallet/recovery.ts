import { createClient, type Hex } from 'viem';
import { createBundlerClient, toWebAuthnAccount } from 'viem/account-abstraction';
import { privateKeyToAccount } from 'viem/accounts';
import { settlementChain as chain } from '@/core/arcNetwork';
import { modularClient } from './config';
import { circleFeeEstimator, type CircleGasPrice } from './fees';
import type { StoredPasskey } from './passkey';

/// Circle passkey recovery calls, proven end to end on Arc mainnet on
/// 2026-09-27 (audit/RECOVERY_SPIKE_2026-09-27.md).

type RecoveryBundler = {
  registerRecoveryAddress: (a: { account: unknown; recoveryAddress: Hex }) => Promise<Hex>;
  estimateRegisterRecoveryAddressGas: (a: { account: unknown; recoveryAddress: Hex }) => Promise<{
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  }>;
  executeRecovery: (a: { account: unknown; credential: { id: string; publicKey: Hex } }) => Promise<Hex>;
  waitForUserOperationReceipt: (a: { hash: Hex }) => Promise<{ success: boolean; actualGasCost: bigint; receipt: { transactionHash: Hex } }>;
};

async function kit() {
  const m = await import('@circle-fin/modular-wallets-core');
  const { key, chainUrl } = modularClient();
  const transport = m.toModularTransport(chainUrl, key);
  const client = createClient({ chain, transport });
  const circle = client.extend(m.modularWalletActions as never) as unknown as { getUserOperationGasPrice: () => Promise<CircleGasPrice> };
  const estimateFeesPerGas = circleFeeEstimator(() => circle.getUserOperationGasPrice());
  const bundlerFor = (account: Parameters<typeof createBundlerClient>[0]['account']) =>
    createBundlerClient({ account, chain, transport, userOperation: { estimateFeesPerGas } }).extend(
      m.recoveryActions as never,
    ) as unknown as RecoveryBundler;
  return { m, client, estimateFeesPerGas, bundlerFor };
}

const passkeyOwner = (p: StoredPasskey) => toWebAuthnAccount({ credential: { id: p.id, publicKey: p.publicKey }, rpId: p.rpId });

/// The most the switch-on step can take from the balance. ERC-4337 reserves
/// this up front; what the operation does not use stays as the wallet's gas
/// deposit rather than returning to the balance, so this is the honest figure.
export async function estimateRegisterFee(passkey: StoredPasskey, recoveryAddress: Hex): Promise<bigint> {
  const { m, client, estimateFeesPerGas, bundlerFor } = await kit();
  const account = await m.toCircleSmartAccount({ client, owner: passkeyOwner(passkey) });
  const gas = await bundlerFor(account).estimateRegisterRecoveryAddressGas({ account, recoveryAddress });
  const { maxFeePerGas } = await estimateFeesPerGas();
  return (gas.callGasLimit + gas.verificationGasLimit + gas.preVerificationGas) * maxFeePerGas;
}

export async function registerRecoveryOnchain(passkey: StoredPasskey, recoveryAddress: Hex): Promise<{ txHash: Hex; gasCostWei: bigint }> {
  const { m, client, bundlerFor } = await kit();
  const account = await m.toCircleSmartAccount({ client, owner: passkeyOwner(passkey) });
  const bundler = bundlerFor(account);
  const hash = await bundler.registerRecoveryAddress({ account, recoveryAddress });
  const receipt = await bundler.waitForUserOperationReceipt({ hash });
  if (!receipt.success) throw new Error('recovery registration reverted');
  return { txHash: receipt.receipt.transactionHash, gasCostWei: receipt.actualGasCost };
}

/// A signature from the wallet with the recovery key as owner. It verifies on
/// chain (ERC-1271) only once the key is registered, which is the proof the
/// server checks before it marks recovery as on.
export async function proveRecoveryOwner(privateKey: Hex): Promise<{ message: string; signature: Hex; walletAddress: Hex }> {
  const { m, client } = await kit();
  const account = await m.toCircleSmartAccount({ client, owner: privateKeyToAccount(privateKey) });
  const message = `karwan recovery check ${Date.now()}`;
  return { message, signature: await account.signMessage({ message }), walletAddress: account.address };
}

export async function executeRecoveryOnchain(privateKey: Hex, newPasskey: StoredPasskey): Promise<{ txHash: Hex; walletAddress: Hex }> {
  const { m, client, bundlerFor } = await kit();
  const account = await m.toCircleSmartAccount({ client, owner: privateKeyToAccount(privateKey) });
  const bundler = bundlerFor(account);
  const hash = await bundler.executeRecovery({ account, credential: { id: newPasskey.id, publicKey: newPasskey.publicKey } });
  const receipt = await bundler.waitForUserOperationReceipt({ hash });
  if (!receipt.success) throw new Error('recovery reverted');
  return { txHash: receipt.receipt.transactionHash, walletAddress: account.address };
}

/// The wallet's spendable USDC on Arc, in wei (18 decimals, Arc's native unit).
export async function walletBalanceWei(address: Hex): Promise<bigint> {
  const { createPublicClient, fallback, http } = await import('viem');
  const { ARC_NETWORK, publicRpcFor } = await import('@/core/arcNetwork');
  const reader = createPublicClient({
    chain,
    transport: fallback(
      [process.env.NEXT_PUBLIC_ARC_RPC_URL, publicRpcFor(ARC_NETWORK)].filter((u): u is string => !!u).map((u) => http(u)),
    ),
  });
  return reader.getBalance({ address });
}
