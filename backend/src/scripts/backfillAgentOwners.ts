import { listAllAgentWallets } from '../db/agentWallets.js';
import { executeContractCall } from '../chain/txs.js';
import { vault } from '../chain/contracts.js';
import { publicClient } from '../chain/client.js';
import { vaultAbi } from '../chain/abis/vault.js';
import { logger } from '../logger.js';

/// Registers vault.agentOwner mappings for every already-activated user so
/// existing seller agents can satisfy acceptEscrow on the new vault. New users
/// register themselves during activation (routes/activation.ts), but anyone
/// activated before the v2.D-prime redeploy needs this one-shot backfill.
///
/// Run from backend/ with: `npx tsx src/scripts/backfillAgentOwners.ts`.
/// Reads agentWallets from PG or data/agent-wallets.json depending on env.
/// Already-registered agents are skipped via on-chain agentOwner() read.

async function isAlreadyRegistered(agentAddress: string): Promise<boolean> {
  try {
    const mapped = (await publicClient.readContract({
      address: vault.address,
      abi: vaultAbi,
      functionName: 'agentOwner',
      args: [agentAddress as `0x${string}`],
    })) as `0x${string}`;
    return mapped !== '0x0000000000000000000000000000000000000000';
  } catch {
    return false;
  }
}

async function registerOne(walletId: string, agentAddress: string, ownerAddress: string, role: string): Promise<'ok' | 'skip' | 'fail'> {
  const already = await isAlreadyRegistered(agentAddress);
  if (already) {
    logger.info({ role, agent: agentAddress }, 'already registered, skipping');
    return 'skip';
  }
  try {
    await executeContractCall(
      {
        walletId,
        contractAddress: vault.address,
        abiFunctionSignature: 'registerOwner(address)',
        abiParameters: [ownerAddress],
      },
      `backfill.registerOwner(${role} ${agentAddress})`,
    );
    logger.info({ role, agent: agentAddress, owner: ownerAddress }, 'registered');
    return 'ok';
  } catch (err) {
    logger.error({ role, agent: agentAddress, err: (err as Error).message }, 'registration failed');
    return 'fail';
  }
}

async function main() {
  const all = await listAllAgentWallets();
  logger.info({ count: all.length }, 'starting agent-owner backfill');

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const w of all) {
    const sellerResult = await registerOne(w.sellerWalletId, w.sellerAddress, w.userAddress, 'seller');
    if (sellerResult === 'ok') ok++;
    else if (sellerResult === 'skip') skip++;
    else fail++;

    const buyerResult = await registerOne(w.buyerWalletId, w.buyerAddress, w.userAddress, 'buyer');
    if (buyerResult === 'ok') ok++;
    else if (buyerResult === 'skip') skip++;
    else fail++;
  }

  logger.info({ ok, skip, fail, totalUsers: all.length }, 'backfill complete');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'backfill crashed');
  process.exit(1);
});
