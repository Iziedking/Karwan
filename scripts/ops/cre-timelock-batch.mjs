#!/usr/bin/env node
// Safe Transaction Builder batches that bind the three suite CRE workflows to
// the adapter and make the adapter a record issuer, through the timelock.
//   node scripts/ops/cre-timelock-batch.mjs <adapter> <check-id> <record-id> <risk-id> [YYYY-MM-DD]
// Writes contracts/deployments/cre-5042002-<date>.{schedule,execute}.json.
// Hub, timelock, Safe and delay come from the endgame deployment record. The
// workflow ids are the ones `cre workflow deploy` printed; the names are the
// production-settings names in each workflow.yaml.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeFunctionData, keccak256, parseAbi, toHex, zeroHash } from 'viem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEPLOY = join(ROOT, 'contracts', 'deployments');
const suite = JSON.parse(readFileSync(join(DEPLOY, 'endgame-5042002.json'), 'utf8'));
const settings = JSON.parse(readFileSync(join(DEPLOY, 'endgame-5042002.config.json'), 'utf8'));

const [adapter, checkId, recordId, riskId, date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
const addr = /^0x[0-9a-fA-F]{40}$/;
const id = /^(0x)?[0-9a-fA-F]{64}$/;
if (!addr.test(adapter ?? '') || ![checkId, recordId, riskId].every((w) => id.test(w ?? '')) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('usage: cre-timelock-batch.mjs <adapter> <check-id> <record-id> <risk-id> [YYYY-MM-DD]');
  process.exit(2);
}
const hex32 = (w) => (w.startsWith('0x') ? w : `0x${w}`).toLowerCase();

/// The adapter stores the first ten hex characters of sha256(name), as CRE
/// writes them into a report's metadata (EvidenceRegistryDeploymentConfig).
const workflowName = (name) => toHex(createHash('sha256').update(name).digest('hex').slice(0, 10));

const adapterAbi = parseAbi(['function bindWorkflow(uint8 kind, bytes32 workflowId, bytes10 workflowName)']);
const hubAbi = parseAbi(['function setIssuer(address who, bool ok)']);
const timelockAbi = parseAbi([
  'function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)',
  'function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt)',
]);

const bind = (kind, workflowId, name) =>
  encodeFunctionData({ abi: adapterAbi, functionName: 'bindWorkflow', args: [kind, hex32(workflowId), workflowName(name)] });

// Kinds: 1 check, 2 fact, 3 keep, 4 dry run (KarwanCreAdapter).
const calls = [
  [adapter, bind(1, checkId, 'karwan-check')],
  [adapter, bind(4, checkId, 'karwan-check')],
  [adapter, bind(2, recordId, 'karwan-record')],
  [adapter, bind(3, riskId, 'karwan-risk')],
  [suite.hub, encodeFunctionData({ abi: hubAbi, functionName: 'setIssuer', args: [adapter, true] })],
];
const targets = calls.map(([t]) => t);
const values = calls.map(() => 0n);
const payloads = calls.map(([, d]) => d);
const salt = keccak256(toHex(`karwan.cre.suite.bindings.${date}`));

const batch = (name, description, data) => ({
  version: '1.0',
  chainId: String(suite.chainId),
  createdAt: Date.now(),
  meta: { name, description, createdFromSafeAddress: settings.ownerSafe },
  transactions: [{ to: suite.timelock, value: '0', data, contractMethod: null, contractInputsValues: null }],
});

const base = join(DEPLOY, `cre-${suite.chainId}-${date}`);
writeFileSync(
  `${base}.schedule.json`,
  `${JSON.stringify(batch(
    'CRE workflows: schedule',
    'Queues the CRE adapter bindings (check, dry run, fact, keep) and the adapter as a record issuer in the timelock.',
    encodeFunctionData({ abi: timelockAbi, functionName: 'scheduleBatch', args: [targets, values, payloads, zeroHash, salt, BigInt(settings.minDelay)] }),
  ), null, 2)}\n`,
);
writeFileSync(
  `${base}.execute.json`,
  `${JSON.stringify(batch(
    'CRE workflows: execute',
    `Runs the queued CRE bindings once the ${settings.minDelay / 3600} hour timelock delay has passed.`,
    encodeFunctionData({ abi: timelockAbi, functionName: 'executeBatch', args: [targets, values, payloads, zeroHash, salt] }),
  ), null, 2)}\n`,
);
console.log(`timelock ${suite.timelock}, Safe ${settings.ownerSafe}, delay ${settings.minDelay}s, salt ${salt}`);
for (const [t, d] of calls) console.log(t, d.slice(0, 10), d.length);
console.log(`wrote ${base}.schedule.json and ${base}.execute.json`);
