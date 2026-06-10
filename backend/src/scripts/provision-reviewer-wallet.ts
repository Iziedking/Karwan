import { circleWalletsClient, ARC_TESTNET_BLOCKCHAIN } from '../circle/wallets.js';
import { config } from '../config.js';

/// One-shot: provision a dedicated Circle DCW (SCA on Arc Testnet) to act as the
/// KarwanBusinessRegistry reviewer. This wallet signs approve / reject; it is
/// never the deployer and holds no user funds. Run once, then:
///   - use the printed ADDRESS as BUSINESS_REVIEWER_ADDR for the registry deploy
///     (the contract's `reviewer` constructor arg)
///   - use the printed WALLET ID as BUSINESS_REVIEWER_WALLET_ID at runtime (the
///     backend signs the on-chain approve / reject with it)
/// Fund the reviewer address with a little Arc gas before its first approval.
///
///   npm run reviewer:create   (from backend/)
async function main() {
  if (!config.CIRCLE_WALLET_SET_ID) {
    throw new Error('CIRCLE_WALLET_SET_ID is not set');
  }
  const client = circleWalletsClient();
  const res = await client.createWallets({
    blockchains: [ARC_TESTNET_BLOCKCHAIN],
    count: 1,
    walletSetId: config.CIRCLE_WALLET_SET_ID,
    accountType: 'SCA',
    metadata: [{ name: 'karwan-business-reviewer', refId: 'business-reviewer' }],
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet) throw new Error('Circle returned no wallet');

  console.log('Business reviewer DCW provisioned on Arc Testnet:');
  console.log('  BUSINESS_REVIEWER_ADDR        =', wallet.address, '(registry deploy arg)');
  console.log('  BUSINESS_REVIEWER_WALLET_ID   =', wallet.id, '(backend runtime)');
  console.log('Fund the address with a little Arc gas before the first approval.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
