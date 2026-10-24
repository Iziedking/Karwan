/// Provision the deposit wallets that existing email accounts never got.
///
/// Activation used to eagerly provision four EVM chains plus Solana, so an
/// account created before that widened has no wallet record for Optimism,
/// Avalanche or Unichain. `depositWatcher` indexes on `bridgeWallets`, so a
/// deposit sent to one of those chains was never recognised and never bridged:
/// the money sat at a real address that nothing was watching. Widening
/// activation fixes new accounts; this fixes the ones already on the books.
///
/// Safe to re-run. It only provisions chains missing from the record, and
/// `provisionUserBridgeWallet` is itself keyed per user and chain.
///
///   npm run backfill:deposit-wallets            # report only
///   npm run backfill:deposit-wallets -- --write # provision and save
///
/// Money sent to a chain before its wallet existed raised no Circle webhook, so
/// it was never moved to Arc. `--stranded` reads the USDC already sitting in
/// every email account's deposit wallets and reports it; `--stranded --route`
/// moves each balance to the owner's Arc address through the same route a live
/// deposit takes, keyed by wallet and amount so a re-run never bridges twice.
///
///   npm run backfill:deposit-wallets -- --stranded          # report balances
///   npm run backfill:deposit-wallets -- --stranded --route  # move them to Arc
import {
  provisionUserBridgeWallet,
  BASE_SEPOLIA_BLOCKCHAIN,
  ETH_SEPOLIA_BLOCKCHAIN,
  OP_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  AVAX_FUJI_BLOCKCHAIN,
  UNI_SEPOLIA_BLOCKCHAIN,
  SOL_DEVNET_BLOCKCHAIN,
  type BridgeBlockchain,
} from '../circle/wallets.js';
import { listAllAgentWallets, saveAgentWallets } from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { invalidateDepositIndex } from '../circle/depositWatcher.js';
import { logger } from '../logger.js';
import { createPublicClient, erc20Abi, http } from 'viem';
import { CCTP_CHAINS, CCTP_CHAIN_KEYS, chainKeyForCircleBlockchain, type CctpChainKey } from '../chain/cctpChains.js';
import { routeDepositToArcNow } from '../circle/depositRouter.js';
import { formatUsdcMicros } from '../money/model.js';

/// Must stay in step with `eagerBridgeChains` in routes/activation.ts.
const WANTED: BridgeBlockchain[] = [
  BASE_SEPOLIA_BLOCKCHAIN,
  ETH_SEPOLIA_BLOCKCHAIN,
  OP_SEPOLIA_BLOCKCHAIN,
  ARB_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  AVAX_FUJI_BLOCKCHAIN,
  UNI_SEPOLIA_BLOCKCHAIN,
  SOL_DEVNET_BLOCKCHAIN,
];

/// USDC already sitting in deposit wallets on EVM chains Karwan can sign on.
async function stranded(route: boolean): Promise<void> {
  const all = await listAllAgentWallets();
  let found = 0;
  for (const wallets of all) {
    if (!getUserByAddress(wallets.userAddress)?.circleIdentityWalletId) continue;
    for (const [blockchain, wallet] of Object.entries(wallets.bridgeWallets ?? {})) {
      const key = chainKeyForCircleBlockchain(blockchain);
      if (!key || !(CCTP_CHAIN_KEYS as readonly string[]).includes(key)) continue;
      const chain = CCTP_CHAINS[key as CctpChainKey];
      if (!chain.circleBlockchain) continue;
      const client = createPublicClient({ chain: chain.viemChain, transport: http() });
      const micros = await client
        .readContract({ address: chain.usdc as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address as `0x${string}`] })
        .catch((err: Error) => {
          logger.warn({ userAddress: wallets.userAddress, blockchain, err: err.message }, 'stranded: balance read failed');
          return 0n;
        });
      if (micros < 1_000_000n) continue;
      found += 1;
      const amountUsdc = formatUsdcMicros(micros);
      console.log(`${wallets.userAddress}  ${blockchain}  ${amountUsdc} USDC at ${wallet.address}`);
      if (!route) continue;
      await routeDepositToArcNow({
        owner: wallets.userAddress,
        amountUsdc,
        chain: blockchain,
        txId: `stranded-${blockchain}-${wallet.walletId}-${micros}`,
      }).catch((err: Error) => logger.warn({ userAddress: wallets.userAddress, blockchain, err: err.message }, 'stranded: route failed'));
    }
  }
  console.log(route ? `
routed ${found} stranded balances to Arc` : `
${found} stranded balances. Re-run with --stranded --route to move them to Arc.`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--stranded')) return stranded(process.argv.includes('--route'));
  const write = process.argv.includes('--write');
  const all = await listAllAgentWallets();
  let considered = 0;
  let provisioned = 0;
  let failed = 0;

  for (const wallets of all) {
    // Web3 accounts never use a backend deposit wallet, and provisioning one
    // advances the shared per-chain index counter, which is what collided
    // addresses across users before. Skip them exactly as activation does.
    const isCircle = !!getUserByAddress(wallets.userAddress)?.circleIdentityWalletId;
    if (!isCircle) continue;

    const have = wallets.bridgeWallets ?? {};
    const missing = WANTED.filter((c) => !have[c]);
    if (missing.length === 0) continue;
    considered += 1;
    console.log(`${wallets.userAddress}  missing: ${missing.join(', ')}`);
    if (!write) continue;

    const next = { ...wallets, bridgeWallets: { ...have } };
    for (const chain of missing) {
      try {
        const created = await provisionUserBridgeWallet(wallets.userAddress, chain, undefined, {
          deriveOnly: chain !== SOL_DEVNET_BLOCKCHAIN,
        });
        next.bridgeWallets[chain] = { walletId: created.walletId, address: created.address };
        provisioned += 1;
      } catch (err) {
        // One chain failing must not cost the others: the rest of this user's
        // record still saves, and a re-run picks up what is still missing.
        failed += 1;
        logger.warn(
          { userAddress: wallets.userAddress, chain, err: (err as Error).message },
          'backfill: deposit wallet provisioning failed',
        );
      }
    }
    await saveAgentWallets(next);
  }

  if (write) invalidateDepositIndex();
  console.log(
    write
      ? `\nprovisioned ${provisioned} wallets across ${considered} accounts (${failed} failed)`
      : `\n${considered} accounts are missing at least one deposit wallet. Re-run with --write to provision.`,
  );
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'backfill-deposit-wallets failed');
  process.exit(1);
});
