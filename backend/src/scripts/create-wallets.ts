import { circleWalletsClient, ARC_TESTNET_BLOCKCHAIN } from '../circle/wallets.js';
import { logger } from '../logger.js';

async function main() {
  const client = circleWalletsClient();

  const walletSetRes = await client.createWalletSet({
    name: `Karwan Agent Wallets ${new Date().toISOString().slice(0, 10)}`,
  });
  const walletSetId = walletSetRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error('createWalletSet returned no id');

  const walletsRes = await client.createWallets({
    blockchains: [ARC_TESTNET_BLOCKCHAIN],
    count: 2,
    walletSetId,
    accountType: 'SCA',
  });

  const wallets = walletsRes.data?.wallets ?? [];
  if (wallets.length !== 2) throw new Error(`expected 2 wallets, got ${wallets.length}`);

  const [buyer, seller] = wallets;
  logger.info(
    {
      walletSetId,
      buyer: { id: buyer?.id, address: buyer?.address },
      seller: { id: seller?.id, address: seller?.address },
    },
    'wallets created',
  );

  console.log('');
  console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);
  console.log(`BUYER_AGENT_WALLET_ID=${buyer?.id ?? ''}`);
  console.log(`BUYER_AGENT_ADDRESS=${buyer?.address ?? ''}`);
  console.log(`SELLER_AGENT_WALLET_ID=${seller?.id ?? ''}`);
  console.log(`SELLER_AGENT_ADDRESS=${seller?.address ?? ''}`);
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'create-wallets failed');
  process.exit(1);
});
