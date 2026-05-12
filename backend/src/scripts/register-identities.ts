import { circleWalletsClient } from '../circle/wallets.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const METADATA_URI_BUYER =
  process.env.BUYER_METADATA_URI ??
  'ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei';
const METADATA_URI_SELLER =
  process.env.SELLER_METADATA_URI ??
  'ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei';

async function pollForCompletion(
  client: ReturnType<typeof circleWalletsClient>,
  txId: string,
  label: string,
): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = await client.getTransaction({ id: txId });
    const state = data?.transaction?.state;
    if (state === 'COMPLETE') {
      const hash = data?.transaction?.txHash;
      if (!hash) throw new Error(`${label} completed without txHash`);
      return hash;
    }
    if (state === 'FAILED') {
      throw new Error(`${label} failed: ${JSON.stringify(data?.transaction)}`);
    }
  }
  throw new Error(`${label} did not complete within 60s`);
}

async function registerAgent(label: string, walletId: string, metadataURI: string) {
  const client = circleWalletsClient();

  const tx = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: config.IDENTITY_REGISTRY_ADDR,
    abiFunctionSignature: 'register(string)',
    abiParameters: [metadataURI],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });

  const txId = tx.data?.id;
  if (!txId) throw new Error(`${label} createContractExecutionTransaction returned no id`);

  const hash = await pollForCompletion(client, txId, label);
  logger.info(
    { label, txHash: hash, explorer: `${config.ARC_TESTNET_EXPLORER_URL}/tx/${hash}` },
    'identity registered',
  );
  return hash;
}

async function main() {
  if (!config.BUYER_AGENT_WALLET_ID || !config.SELLER_AGENT_WALLET_ID) {
    throw new Error('BUYER_AGENT_WALLET_ID and SELLER_AGENT_WALLET_ID must be set');
  }

  const buyerHash = await registerAgent(
    'buyer-agent',
    config.BUYER_AGENT_WALLET_ID,
    METADATA_URI_BUYER,
  );
  const sellerHash = await registerAgent(
    'seller-agent',
    config.SELLER_AGENT_WALLET_ID,
    METADATA_URI_SELLER,
  );

  logger.info({ buyerHash, sellerHash }, 'both identities registered');
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'register-identities failed');
  process.exit(1);
});
