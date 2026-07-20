/// Proves the new provisioning path end to end: a deposit wallet provisioned
/// for a user now lands on that user's OWN identity address, on every EVM
/// chain, instead of taking whatever index the per-chain counter was on.
///
/// Uses the REAL provisionUserBridgeWallet with an explicit anchor, so this
/// exercises the shipped code path rather than a reimplementation of it.
/// Touches no existing user: it mints a throwaway identity wallet first.
///
/// Run: npm run derive:provision-probe

import { circleWalletsClient, provisionUserBridgeWallet } from '../circle/wallets.js';
import { config } from '../config.js';

const CHAINS = ['BASE-SEPOLIA', 'ETH-SEPOLIA', 'MATIC-AMOY'] as const;

async function main() {
  if (!config.CIRCLE_WALLET_SET_ID) throw new Error('CIRCLE_WALLET_SET_ID is not set');
  const stamp = `provision-probe-${Date.now()}`;

  console.log('\n=== throwaway identity wallet (stands in for signup) ===');
  const created = await circleWalletsClient().createWallets({
    blockchains: ['ARC-TESTNET'],
    count: 1,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    accountType: 'SCA',
    metadata: [{ name: 'karwan-provision-probe', refId: stamp }],
  });
  const identity = created.data?.wallets?.[0];
  if (!identity?.id || !identity.address) throw new Error('probe identity wallet failed');
  console.log(`  identity  ${identity.address}  (walletId ${identity.id})`);

  let pass = true;
  for (const chain of CHAINS) {
    // Pass the anchor explicitly: this throwaway address has no users-table
    // row, so the internal lookup would find nothing.
    const w = await provisionUserBridgeWallet(identity.address, chain, identity.id);
    const match = w.address.toLowerCase() === identity.address.toLowerCase();
    if (!match) pass = false;
    console.log(`  ${chain.padEnd(14)} ${w.address}  ${match ? 'MATCHES identity' : 'DIFFERS <-- BAD'}`);
  }

  console.log(
    `\n  ${pass ? 'PASS — one address per user across every EVM chain. Two users can no longer collide.' : 'FAIL — provisioning still produces divergent addresses.'}\n`,
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  const detail = (err as { response?: { data?: unknown } }).response?.data;
  console.error('\nprobe failed:', detail ? JSON.stringify(detail, null, 2) : (err as Error).message);
  process.exit(1);
});
