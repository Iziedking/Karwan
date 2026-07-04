import { circleWalletsClient } from '../circle/wallets.js';
import {
  listAllAgentWallets,
  getAgentWallets,
  updateAgentAddresses,
} from '../db/agentWallets.js';
import { logger } from '../logger.js';

/// Diagnose (and optionally repair) drift between the agent SCA address we
/// stored at activation and the address the Circle walletId actually signs from
/// now.
///
/// Root cause of the "posted a request, got a phantom jobId that 404s" bug: the
/// JobBoard derives jobId = keccak256(msg.sender, salt) from the REAL signer,
/// but the backend derived it from the STORED address. Circle returns the
/// counterfactual SCA address at activation; if it later migrates the wallet set
/// or upgrades the SCA implementation, the walletId keeps signing from a new
/// deployed address while our copy goes stale. The two ids then disagree and the
/// buyer is stranded on a job that lives under a different id. The same stale
/// address also mis-targets the gas-balance precheck, own-auction exclusion, and
/// reputation keying.
///
/// Read-only by default; prints every drift. Set FIX=1 to write Circle's live
/// address back to the record. Scope to one account with USER_ADDRESS=0x...;
/// omit to scan all.
///   node dist/scripts/diagnose-agent-addresses.js
///   USER_ADDRESS=0x.. node dist/scripts/diagnose-agent-addresses.js
///   FIX=1 node dist/scripts/diagnose-agent-addresses.js

const fix = process.env.FIX === '1' || process.env.FIX === 'true';
const only = process.env.USER_ADDRESS?.toLowerCase();

async function circleAddress(walletId: string): Promise<string | null> {
  try {
    const res = await circleWalletsClient().getWallet({ id: walletId });
    const addr = (res.data?.wallet?.address ?? '').toLowerCase();
    return addr || null;
  } catch (err) {
    logger.warn({ walletId, err: (err as Error).message }, 'getWallet failed');
    return null;
  }
}

async function main() {
  const records = only
    ? [await getAgentWallets(only)].filter((r): r is NonNullable<typeof r> => r !== null)
    : await listAllAgentWallets();

  let scanned = 0;
  let drifted = 0;
  let repaired = 0;

  for (const rec of records) {
    scanned += 1;
    const [buyerLive, sellerLive] = await Promise.all([
      circleAddress(rec.buyerWalletId),
      circleAddress(rec.sellerWalletId),
    ]);
    const buyerDrift = buyerLive != null && buyerLive !== rec.buyerAddress.toLowerCase();
    const sellerDrift = sellerLive != null && sellerLive !== rec.sellerAddress.toLowerCase();
    if (!buyerDrift && !sellerDrift) continue;

    drifted += 1;
    logger.warn(
      {
        user: rec.userAddress,
        buyerStored: rec.buyerAddress,
        buyerLive,
        buyerDrift,
        sellerStored: rec.sellerAddress,
        sellerLive,
        sellerDrift,
      },
      'agent address drift detected',
    );

    if (fix) {
      await updateAgentAddresses(rec.userAddress, {
        buyerAddress: buyerDrift ? buyerLive : undefined,
        sellerAddress: sellerDrift ? sellerLive : undefined,
      });
      repaired += 1;
      logger.info({ user: rec.userAddress }, 'agent addresses re-synced from Circle');
    }
  }

  logger.info({ scanned, drifted, repaired, fix }, 'agent address diagnosis complete');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err: (err as Error).message }, 'agent address diagnosis failed');
    process.exit(1);
  });
