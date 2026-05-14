import { config } from '../config.js';
import { escrow, readEscrow } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { logger } from '../logger.js';

async function main() {
  const jobId = process.env.JOB_ID;
  if (!jobId) throw new Error('JOB_ID env var required (0x… 32-byte hex)');
  if (!config.BUYER_AGENT_WALLET_ID) throw new Error('BUYER_AGENT_WALLET_ID required');

  const totalMilestones = Number(process.env.MILESTONES ?? '2');
  if (!Number.isInteger(totalMilestones) || totalMilestones < 1 || totalMilestones > 4) {
    throw new Error(`MILESTONES must be 1..4, got ${totalMilestones}`);
  }

  const account = await readEscrow(jobId);
  if (account.state !== 1) {
    throw new Error(`escrow state must be Funded(1), got ${account.state}`);
  }

  logger.info(
    {
      jobId,
      buyer: account.buyer,
      seller: account.seller,
      dealAmount: account.dealAmount.toString(),
      sellerNet: account.sellerNet.toString(),
      feeTotal: account.feeTotal.toString(),
      released: account.released.toString(),
      milestonesReleased: account.milestonesReleased,
      totalMilestones,
    },
    'releasing remaining milestones',
  );

  for (let i = account.milestonesReleased; i < totalMilestones; i++) {
    const result = await executeContractCall(
      {
        walletId: config.BUYER_AGENT_WALLET_ID,
        contractAddress: escrow.address,
        abiFunctionSignature: 'releaseProgress(bytes32,uint8)',
        abiParameters: [jobId, i.toString()],
      },
      `releaseProgress(${jobId}, ${i})`,
    );
    logger.info({ jobId, milestoneIndex: i, ...result }, 'milestone released');
  }

  logger.info({ jobId }, 'all milestones released — escrow settled');
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'release-milestones failed');
  process.exit(1);
});
