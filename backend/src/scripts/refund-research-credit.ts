/// Return research credit people prepaid, now that agents pay for their own
/// research (view 48, decision 2). Each balance goes back from the treasury to
/// the buying agent it was paid from (or the person's own wallet without one),
/// then the credit is zeroed and a refund row is written to their history.
///
/// Read-only by default: prints who gets what and the total.
///
///   node dist/scripts/refund-research-credit.js                 (report)
///   REFUND_SIGNER_PRIVATE_KEY=0x… node dist/scripts/refund-research-credit.js --execute
///
/// The signer must be the treasury (KARWAN_TREASURY_ADDR): the activation fees
/// were paid there. The transfer's hash is kept on the profile as soon as it is
/// sent, and the credit zeroed once Arc confirms it; a revert or a timeout stops
/// the run, and a re-run skips anyone with a hash kept, so nobody is paid twice.

import 'dotenv/config';
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcChain, arcRpcUrls, arcTransport } from './arcRpc.js';
import { config } from '../config.js';
import { ensureSchema } from '../db/client.js';
import { listProfiles, updateProfile } from '../db/profiles.js';
import { listAllAgentWallets } from '../db/agentWallets.js';
import { appendActivity } from '../db/activityLog.js';
import { researchRefundPlan } from './researchRefund.js';

const execute = process.argv.includes('--execute');

async function main(): Promise<void> {
  await ensureSchema();
  const [profiles, wallets] = await Promise.all([listProfiles(), listAllAgentWallets()]);
  const buyingAgentOf = new Map(wallets.filter((w) => w.buyerAddress).map((w) => [w.userAddress.toLowerCase(), w.buyerAddress]));
  const plan = researchRefundPlan(profiles, buyingAgentOf);

  for (const r of plan.rows) {
    console.log(`${r.owner}  ${formatUnits(r.amountMicros, 6)} USDC  to ${r.toAgent ? 'buying agent' : 'own wallet'} ${r.to}`);
  }
  console.log(`${plan.rows.length} account(s), ${formatUnits(plan.totalMicros, 6)} USDC in all.`);
  if (!execute) {
    console.log('Report only. Run with --execute and REFUND_SIGNER_PRIVATE_KEY to send.');
    return;
  }

  const key = process.env.REFUND_SIGNER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error('REFUND_SIGNER_PRIVATE_KEY is required with --execute');
  const account = privateKeyToAccount(key);
  if (!config.KARWAN_TREASURY_ADDR || getAddress(config.KARWAN_TREASURY_ADDR) !== account.address) {
    throw new Error(`the signer ${account.address} is not the treasury ${config.KARWAN_TREASURY_ADDR ?? '(unset)'}`);
  }
  const urls = arcRpcUrls();
  const chain = arcChain(urls);
  const transport = arcTransport(urls);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const usdc = getAddress(config.USDC_ADDR);

  const balance = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  if (balance < plan.totalMicros) {
    throw new Error(`the treasury holds ${formatUnits(balance, 6)} USDC, short of ${formatUnits(plan.totalMicros, 6)}`);
  }

  for (const r of plan.rows) {
    const hash = await walletClient.writeContract({ address: usdc, abi: erc20Abi, functionName: 'transfer', args: [getAddress(r.to), r.amountMicros] });
    // Kept before waiting, so a run that stops here is never paid again.
    await updateProfile(r.owner, (p) => (p.research ? { ...p, research: { ...p.research, refundTx: hash } } : p));
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== 'success') throw new Error(`refund to ${r.owner} reverted in ${hash}; stopped. Check it, then clear refundTx on that profile to retry.`);
    await updateProfile(r.owner, (p) => ({ ...p, research: { active: false, creditUsdc: 0, activatedAt: p.research?.activatedAt ?? Date.now(), lastChargedAt: Date.now(), refundTx: hash } }));
    await appendActivity({
      address: r.owner,
      kind: 'refund',
      summary: `Research credit returned: ${formatUnits(r.amountMicros, 6)} USDC`,
      amountUsdc: formatUnits(r.amountMicros, 6),
      txHash: hash,
    });
    console.log(`refunded ${r.owner} in ${hash}`);
  }
}

main().then(
  () => process.exit(0),
  (err: Error) => {
    console.error(err.message);
    process.exit(1);
  },
);
