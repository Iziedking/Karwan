import { formatUnits, isAddress } from 'viem';
import { config } from '../config.js';
import { arcTestnet, publicClient } from '../chain/client.js';
import { jobBoard, escrow, reputation, usdc } from '../chain/contracts.js';
import { logger } from '../logger.js';

async function main() {
  const [chainId, blockNumber] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlockNumber(),
  ]);

  if (chainId !== arcTestnet.id) {
    logger.error({ expected: arcTestnet.id, got: chainId }, 'chain id mismatch');
    process.exit(1);
  }

  logger.info(
    { chainId, latestBlock: blockNumber.toString(), rpc: config.ARC_TESTNET_RPC_URL },
    'rpc reachable',
  );

  const wallets = [
    { label: 'buyer-agent', address: config.BUYER_AGENT_ADDRESS },
    { label: 'seller-agent', address: config.SELLER_AGENT_ADDRESS },
  ];

  for (const w of wallets) {
    if (!w.address) {
      logger.warn({ wallet: w.label }, 'address not configured');
      continue;
    }
    if (!isAddress(w.address)) {
      logger.error({ wallet: w.label, address: w.address }, 'invalid address');
      continue;
    }
    const balance = await publicClient.getBalance({ address: w.address });
    logger.info(
      {
        wallet: w.label,
        address: w.address,
        balanceUSDC: formatUnits(balance, arcTestnet.nativeCurrency.decimals),
      },
      'wallet balance',
    );
  }

  const escrowUsdc = await escrow.read.usdc();
  if (escrowUsdc.toLowerCase() !== usdc.toLowerCase()) {
    logger.error({ expected: usdc, got: escrowUsdc }, 'escrow.usdc address mismatch');
    process.exit(1);
  }

  logger.info(
    {
      jobBoard: jobBoard.address,
      escrow: escrow.address,
      reputation: reputation.address,
      escrowUsdcBinding: escrowUsdc,
    },
    'karwan contracts reachable',
  );

  logger.info('ok');
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'smoke test failed');
  process.exit(1);
});
