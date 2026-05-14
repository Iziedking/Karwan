import { circleWalletsClient } from '../circle/wallets.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface ContractCallInput {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: unknown[];
  feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ContractCallResult {
  txId: string;
  txHash: string;
  explorerUrl: string;
}

export async function executeContractCall(
  input: ContractCallInput,
  label: string,
): Promise<ContractCallResult> {
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

  // Circle typically settles testnet txs in < 20s. We poll up to 90s.
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = await client.getTransaction({ id: txId });
    const state = data?.transaction?.state;
    if (state === 'COMPLETE') {
      const hash = data?.transaction?.txHash;
      if (!hash) throw new Error(`${label}: completed without txHash`);
      const explorerUrl = `${config.ARC_TESTNET_EXPLORER_URL}/tx/${hash}`;
      logger.info({ label, txHash: hash, explorerUrl }, 'tx confirmed');
      return { txId, txHash: hash, explorerUrl };
    }
    if (state === 'FAILED' || state === 'CANCELLED' || state === 'DENIED') {
      throw new Error(`${label}: tx ${state}: ${JSON.stringify(data?.transaction)}`);
    }
  }
  throw new Error(`${label}: tx did not settle within 90s`);
}
