/// Provision a standalone Solana (SOL-DEVNET) Developer-Controlled Wallet and
/// print its address + walletId — so you have a Solana DCW to fund and use as the
/// source in `npm run solana:bridge-smoke`. Solana DCWs are EOA (ed25519); Circle
/// SCA is EVM-only. This does NOT touch a user's agent-wallet record (it is a
/// throwaway test wallet under the same wallet set).
///
/// Usage:  npm run solana:wallet
///
/// After it prints the address:
///   1. Get Devnet USDC to it at https://faucet.circle.com (chain: Solana Devnet).
///   2. Get a little Devnet SOL to it at https://faucet.solana.com (for rent/gas).
///   3. Use the address as <solanaSourceDCW> in solana:bridge-smoke.

import { circleWalletsClient, SOL_DEVNET_BLOCKCHAIN } from '../circle/wallets.js';
import { config } from '../config.js';

async function main() {
  if (!config.CIRCLE_API_KEY || !config.CIRCLE_ENTITY_SECRET) {
    console.error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required in .env');
    process.exit(2);
  }
  if (!config.CIRCLE_WALLET_SET_ID) {
    console.error('CIRCLE_WALLET_SET_ID is required in .env');
    process.exit(2);
  }
  if (!config.CIRCLE_API_KEY.startsWith('TEST_API_KEY')) {
    console.warn('WARNING: CIRCLE_API_KEY is not a TEST_API_KEY.');
  }

  const client = circleWalletsClient();
  const res = await client.createWallets({
    blockchains: [SOL_DEVNET_BLOCKCHAIN],
    count: 1,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    accountType: 'EOA', // SOL DCWs must be EOA; Circle SCA is EVM-only.
    metadata: [{ name: 'karwan-solana-smoke' }],
  });
  const w = res.data?.wallets?.[0];
  if (!w?.id || !w.address) {
    console.error('createWallets returned incomplete data:', JSON.stringify(res.data));
    process.exit(1);
  }
  console.log('\nSolana DCW provisioned:');
  console.log('  walletId:', w.id);
  console.log('  address :', w.address);
  console.log(
    '\nNext: fund it with Devnet USDC (faucet.circle.com) + a little Devnet SOL (faucet.solana.com),',
  );
  console.log('then run:  npm run solana:bridge-smoke -- ' + w.address + ' <arcRecipient0x> 0.5');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nError:', (err as Error).message);
  process.exit(1);
});
