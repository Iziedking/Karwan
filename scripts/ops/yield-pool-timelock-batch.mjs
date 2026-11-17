#!/usr/bin/env node
// Safe Transaction Builder batches that switch on the USDC yield pool through
// the timelock: the hub points at the pool, once, and the pool points at
// Circle's USYC Teller on Arc Testnet.
//   node scripts/ops/yield-pool-timelock-batch.mjs <pool-address> [YYYY-MM-DD]
// Writes contracts/deployments/yield-pool-5042002-<date>.{schedule,execute}.json.
// The batch can run before Circle allowlists the pool: until then every
// subscription fails quietly and the pool holds cash. It must run before
// contests open on the second job escrow, or they never take the yield share.
// Teller from https://developers.circle.com/tokenized/usyc/smart-contracts,
// read on chain 17 Nov 2026 (docs/arc-circle-checks.md).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeFunctionData, keccak256, parseAbi, toHex, zeroHash } from 'viem';

const USYC_TELLER_ARC_TESTNET = '0x9fdF14c5B14173D74C08Af27AebFf39240dC105A';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEPLOY = join(ROOT, 'contracts', 'deployments');
const suite = JSON.parse(readFileSync(join(DEPLOY, 'endgame-5042002.json'), 'utf8'));
const settings = JSON.parse(readFileSync(join(DEPLOY, 'endgame-5042002.config.json'), 'utf8'));

const [pool, date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{40}$/.test(pool ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('usage: yield-pool-timelock-batch.mjs <pool-address> [YYYY-MM-DD]');
  process.exit(2);
}

const hubAbi = parseAbi(['function setYieldPool(address asset, address pool)']);
const poolAbi = parseAbi(['function setTeller(address teller)']);
const timelockAbi = parseAbi([
  'function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt)',
]);

const targets = [suite.hub, pool];
const values = [0n, 0n];
const payloads = [
  encodeFunctionData({ abi: hubAbi, functionName: 'setYieldPool', args: [settings.usdc, pool] }),
  encodeFunctionData({ abi: poolAbi, functionName: 'setTeller', args: [USYC_TELLER_ARC_TESTNET] }),
];
const salt = keccak256(toHex(`karwan.yieldpool.usdc.${date}`));

const batch = (name, description, data) => ({
  version: '1.0',
  chainId: String(suite.chainId),
  createdAt: Date.now(),
  meta: { name, description, createdFromSafeAddress: settings.ownerSafe },
  transactions: [{ to: suite.timelock, value: '0', data, contractMethod: null, contractInputsValues: null }],
});

const base = join(DEPLOY, `yield-pool-${suite.chainId}-${date}`);
writeFileSync(
  `${base}.schedule.json`,
  `${JSON.stringify(batch(
    'USDC yield pool: schedule',
    `Queues hub.setYieldPool(USDC, ${pool}) and pool.setTeller(${USYC_TELLER_ARC_TESTNET}), the USYC Teller on Arc Testnet.`,
    encodeFunctionData({ abi: timelockAbi, functionName: 'scheduleBatch', args: [targets, values, payloads, zeroHash, salt, BigInt(settings.minDelay)] }),
  ), null, 2)}\n`,
);
writeFileSync(
  `${base}.execute.json`,
  `${JSON.stringify(batch(
    'USDC yield pool: execute',
    `Runs the queued yield pool settings once the ${settings.minDelay / 3600} hour timelock delay has passed.`,
    encodeFunctionData({ abi: timelockAbi, functionName: 'executeBatch', args: [targets, values, payloads, zeroHash, salt] }),
  ), null, 2)}\n`,
);
console.log(`timelock ${suite.timelock}, Safe ${settings.ownerSafe}, delay ${settings.minDelay}s, salt ${salt}`);
console.log(`wrote ${base}.schedule.json and ${base}.execute.json`);
