/// Makes the Circle wallet set that payment-link receiving addresses live in,
/// kept apart from account wallets so creating them never shares an index.
/// Run once per network inside the backend container, then put the printed
/// line in the backend env and restart:
///
///   docker exec karwan-api node dist/scripts/create-paylink-wallet-set.js
///
/// Prints only the new id. Refuses to run when one is already configured, so a
/// second run cannot leave two sets and an orphaned config.

import { config } from '../config.js';
import { circleWalletsClient } from '../circle/wallets.js';

async function main() {
  if (config.CIRCLE_PAYLINK_WALLET_SET_ID) {
    console.log('CIRCLE_PAYLINK_WALLET_SET_ID is already set; nothing to do.');
    return;
  }
  if (!config.CIRCLE_API_KEY || !config.CIRCLE_ENTITY_SECRET) {
    throw new Error('Circle API key and entity secret must be set in this environment.');
  }
  const res = await circleWalletsClient().createWalletSet({ name: 'Karwan payment links' });
  const id = res.data?.walletSet?.id;
  if (!id) throw new Error('createWalletSet returned no id');
  console.log(`CIRCLE_PAYLINK_WALLET_SET_ID=${id}`);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
