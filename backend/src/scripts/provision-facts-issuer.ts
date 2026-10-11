import { circleWalletsClient, ARC_BLOCKCHAIN } from '../circle/wallets.js';
import { config } from '../config.js';

/// One-shot: the Circle DCW (SCA on the active Arc network) that writes facts
/// to KarwanFacts. It holds no user funds and is never the deployer. Running it
/// again prints the same wallet instead of making a second one.
///   - the printed ADDRESS is FACTS_ISSUER for DeployFacts (the contract only
///     accepts records from issuers it allowlists)
///   - the printed WALLET ID is FACTS_ISSUER_WALLET_ID at runtime
/// Fund the address with a little USDC on Arc for gas before the first fact.
///
///   npm run facts-issuer:create                                   (from backend/)
///   docker compose exec -T karwan-api node dist/scripts/provision-facts-issuer.js
const REF_ID = 'facts-issuer';

async function main() {
  if (!config.CIRCLE_WALLET_SET_ID) {
    throw new Error('CIRCLE_WALLET_SET_ID is not set');
  }
  const client = circleWalletsClient();
  const existing = await client.listWallets({
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    blockchain: ARC_BLOCKCHAIN,
    refId: REF_ID,
  });
  let wallet = existing.data?.wallets?.[0];
  if (wallet) {
    console.log(`Facts issuer DCW already exists on ${ARC_BLOCKCHAIN}:`);
  } else {
    const res = await client.createWallets({
      blockchains: [ARC_BLOCKCHAIN],
      count: 1,
      walletSetId: config.CIRCLE_WALLET_SET_ID,
      accountType: 'SCA',
      metadata: [{ name: 'karwan-facts-issuer', refId: REF_ID }],
    });
    wallet = res.data?.wallets?.[0];
    if (!wallet) throw new Error('Circle returned no wallet');
    console.log(`Facts issuer DCW provisioned on ${ARC_BLOCKCHAIN}:`);
  }

  console.log('  FACTS_ISSUER             =', wallet.address, '(DeployFacts)');
  console.log('  FACTS_ISSUER_WALLET_ID   =', wallet.id, '(backend runtime)');
  console.log('Fund the address with a little USDC on Arc for gas before the first fact.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
