#!/usr/bin/env node
// Safe Transaction Builder batches that register the second job escrow
// (view 88) on the hub through the timelock: the family at the suite fee, and
// its USDC caps, the same as the first job escrow's.
//   node scripts/ops/jobs-v2-timelock-batch.mjs <jobs-v2-address> [YYYY-MM-DD]
// Writes contracts/deployments/jobs-v2-5042002-<date>.{schedule,execute}.json.
// Hub, timelock, Safe, fee, caps and delay come from the endgame deployment
// record. The first job escrow is not retired here: it keeps paying its open
// contests, and is retired once the backend opens new contests on this one.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeFunctionData, keccak256, parseAbi, toHex, zeroHash } from 'viem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEPLOY = join(ROOT, 'contracts', 'deployments');
const suite = JSON.parse(readFileSync(join(DEPLOY, 'endgame-5042002.json'), 'utf8'));
const settings = JSON.parse(readFileSync(join(DEPLOY, 'endgame-5042002.config.json'), 'utf8'));

const [jobs, date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{40}$/.test(jobs ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('usage: jobs-v2-timelock-batch.mjs <jobs-v2-address> [YYYY-MM-DD]');
  process.exit(2);
}
if (jobs.toLowerCase() === String(suite.jobs).toLowerCase()) {
  console.error('that is the first job escrow, already registered');
  process.exit(2);
}

const hubAbi = parseAbi([
  'function registerFamily(address family, uint16 feeBps)',
  'function setCaps(address family, address asset, uint128 perDeal, uint128 total)',
]);
const timelockAbi = parseAbi([
  'function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt)',
]);

const payloads = [
  encodeFunctionData({ abi: hubAbi, functionName: 'registerFamily', args: [jobs, settings.feeBps] }),
  encodeFunctionData({ abi: hubAbi, functionName: 'setCaps', args: [jobs, settings.usdc, BigInt(settings.perDealCap), BigInt(settings.totalCap)] }),
];
const targets = payloads.map(() => suite.hub);
const values = payloads.map(() => 0n);
const salt = keccak256(toHex(`karwan.jobs.v2.${date}`));

const batch = (name, description, data) => ({
  version: '1.0',
  chainId: String(suite.chainId),
  createdAt: Date.now(),
  meta: { name, description, createdFromSafeAddress: settings.ownerSafe },
  transactions: [{ to: suite.timelock, value: '0', data, contractMethod: null, contractInputsValues: null }],
});

const base = join(DEPLOY, `jobs-v2-${suite.chainId}-${date}`);
writeFileSync(
  `${base}.schedule.json`,
  `${JSON.stringify(batch(
    'Job escrow v2: schedule',
    `Queues registerFamily and setCaps on the hub for the second job escrow ${jobs} (view 88).`,
    encodeFunctionData({ abi: timelockAbi, functionName: 'scheduleBatch', args: [targets, values, payloads, zeroHash, salt, BigInt(settings.minDelay)] }),
  ), null, 2)}\n`,
);
writeFileSync(
  `${base}.execute.json`,
  `${JSON.stringify(batch(
    'Job escrow v2: execute',
    `Runs the queued registration once the ${settings.minDelay / 3600} hour timelock delay has passed.`,
    encodeFunctionData({ abi: timelockAbi, functionName: 'executeBatch', args: [targets, values, payloads, zeroHash, salt] }),
  ), null, 2)}\n`,
);
console.log(`timelock ${suite.timelock}, Safe ${settings.ownerSafe}, delay ${settings.minDelay}s, salt ${salt}`);
console.log(`wrote ${base}.schedule.json and ${base}.execute.json`);
