import { circleWalletsClient } from '../circle/wallets.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ContractCallInput {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: unknown[];
  feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  /// How many 2s poll iterations to wait for the tx to settle. Default 45
  /// (~90s). Raise for chains/paths where Circle DCW confirmation runs slow
  /// (e.g. the CCTP bridge approve+burn on Base Sepolia, which can exceed 90s
  /// and otherwise throws "did not settle" even though the tx confirms).
  pollAttempts?: number;
}

export interface ContractCallResult {
  txId: string;
  txHash: string;
  explorerUrl: string;
}

export interface TxState {
  state?: string;
  txHash?: string;
}

/// Submit a contract execution and return the Circle transaction id WITHOUT
/// waiting for it to settle. Callers that can tolerate slow settlement (the
/// CCTP source-chain approve+burn on testnet) persist this id and poll it in a
/// background loop, so a slow-but-successful Circle tx is never thrown away.
export async function submitContractCall(
  input: ContractCallInput,
  label: string,
): Promise<{ txId: string }> {
  const client = circleWalletsClient();
  const fee = input.feeLevel ?? 'MEDIUM';
  const created = await client.createContractExecutionTransaction({
    walletId: input.walletId,
    contractAddress: input.contractAddress,
    abiFunctionSignature: input.abiFunctionSignature,
    abiParameters: input.abiParameters as never,
    fee: { type: 'level', config: { feeLevel: fee } },
  });
  const txId = created.data?.id;
  if (!txId) throw new Error(`${label}: createContractExecutionTransaction returned no id`);
  return { txId };
}

/// Single read of a Circle transaction's state + on-chain hash. The hash is
/// populated once Circle reaches COMPLETE (and sometimes earlier).
export async function getTxState(txId: string): Promise<TxState> {
  const client = circleWalletsClient();
  const { data } = await client.getTransaction({ id: txId });
  return { state: data?.transaction?.state, txHash: data?.transaction?.txHash };
}

/// Submit a contract execution and block until it settles. Use this only on
/// fast paths (Arc, where USDC is gas and finality is sub-second) or inside a
/// background loop. For the CCTP source side prefer submitContractCall + a
/// background poll, because testnet settlement can exceed any sane sync window.
export async function executeContractCall(
  input: ContractCallInput,
  label: string,
): Promise<ContractCallResult> {
  const { txId } = await submitContractCall(input, label);

  // Circle typically settles testnet txs in < 20s. We poll every 2s up to the
  // configured attempt cap (default 45 = ~90s).
  const attempts = input.pollAttempts ?? 45;
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { state, txHash } = await getTxState(txId);
    if (state === 'COMPLETE') {
      if (!txHash) throw new Error(`${label}: completed without txHash`);
      const explorerUrl = `${config.ARC_TESTNET_EXPLORER_URL}/tx/${txHash}`;
      logger.info({ label, txHash, explorerUrl }, 'tx confirmed');
      return { txId, txHash, explorerUrl };
    }
    if (state === 'FAILED' || state === 'CANCELLED' || state === 'DENIED') {
      throw new Error(`${label}: tx ${state}`);
    }
  }
  throw new Error(`${label}: tx did not settle within ${attempts * 2}s`);
}
