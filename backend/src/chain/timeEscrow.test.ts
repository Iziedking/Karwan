import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, encodeEventTopics, getAddress, toFunctionSelector, type Hex, type Log, type TransactionReceipt } from 'viem';
import {
  buildTimeTerms,
  engagementIdFor,
  payFor,
  proveApproved,
  proveOffered,
  proveSettled,
  timeEscrowAbi,
  timeTermsHash,
  weekCost,
  type TimeTermsT,
} from './timeEscrow.js';

/// The time escrow on the family (view 32): hourly work and monthly retainers.

const ESCROW: Hex = getAddress('0xdb32e026b2fb71e4a40e68ded28bc075c1fe11c1');
const USDC: Hex = getAddress('0x3600000000000000000000000000000000000000');
const HIRER: Hex = getAddress('0x1111111111111111111111111111111111111111');
const WORKER: Hex = getAddress('0x0000000000000000000000000000000000000002');
const ID: Hex = `0x${'ab'.repeat(32)}`;

const fixed: TimeTermsT = {
  asset: USDC, worker: WORKER, rate: 15_000_000n, unitScale: 60, maxUnits: 1200, cycleSecs: 604_800, cycles: 2,
  startsAt: 1_800_000_000n, acceptBy: 1_800_000_000n, claimGrace: 172_800, reviewWindow: 259_200, noticeCycles: 1,
  rollover: false, partialBps: 0, fallbackBps: 5000, agreementHash: `0x${'11'.repeat(32)}`,
};

test('the calls match the deployed contract', () => {
  // The forge artifact's method identifiers, each found in the bytecode at
  // 0xdB32…11C1 on Arc Testnet on 29 Oct 2026.
  const deployed: Record<string, string> = {
    open: '3e92a944', accept: '531f4c40', cancelOffer: 'f952279e', fundCycle: '6df2c28f', submit: '7d153654',
    approve: '8fa3f8f6', settle: 'd48397b7', object: 'd88b4fff', giveNotice: '4eff3fc4', close: '39c79e0c',
    escalate: '4145b926', rule: 'ad066cc6', applyFallback: '1668c68c', getEngagement: '87c7fe7c', getCycle: '3b22a5bb',
  };
  for (const [name, selector] of Object.entries(deployed)) {
    const f = timeEscrowAbi.find((x) => x.type === 'function' && x.name === name);
    assert.ok(f, name);
    assert.equal(toFunctionSelector(f as never), `0x${selector}`, name);
  }
});

test('the terms hash and the id equal the deployed contract', () => {
  // cast call termsHashOf(fixed) and dealIdFor(0x…01, 0x…02) on Arc Testnet,
  // block 69,700,130, 29 Oct 2026.
  assert.equal(timeTermsHash(fixed), '0x425d10be49189d300d444838429e6f694159328bae17ea8ccac242640156fa78');
  const salt: Hex = `0x${'0'.repeat(63)}2`;
  const id = engagementIdFor({ chainId: 5042002, escrow: ESCROW, employer: '0x0000000000000000000000000000000000000001', salt });
  assert.equal(id, '0x8c6ec9cbc527c1976506039bc6ca64f056a05057c80ada9fc17cd16f12777284');
});

test('hourly terms bill by the minute with the decided timings; monthly bills one month', () => {
  const h = buildTimeTerms({ kind: 'hourly', asset: USDC, worker: WORKER, rateMicros: 15_000_000n, maxHours: 20, periods: 2, startsAt: 1_800_000_000n, agreementHash: fixed.agreementHash });
  assert.deepEqual(h, fixed);
  const m = buildTimeTerms({ kind: 'monthly', asset: USDC, worker: WORKER, rateMicros: 400_000_000n, maxHours: 1, periods: 3, startsAt: 1_800_000_000n, agreementHash: fixed.agreementHash });
  assert.equal(m.unitScale, 1);
  assert.equal(m.maxUnits, 1);
  assert.equal(m.cycleSecs, 30 * 86_400);
  assert.equal(m.noticeCycles, 1);
});

test('a week of 15 an hour for up to 20 hours, and 12 h 30 m paid, at a 1% fee', () => {
  const w = weekCost(fixed, 100);
  assert.equal(w.total, 301_500_000n);
  const p = payFor(fixed, 100, 750, w.total);
  assert.equal(p.gross, 187_500_000n);
  assert.equal(p.net, 186_562_500n);
  assert.equal(p.fee, 1_875_000n);
  assert.equal(p.back, 113_062_500n);
  assert.equal(p.net + p.fee + p.back, w.total);
});

test('odd minutes follow the contract integer maths and nothing is lost', () => {
  const p = payFor(fixed, 100, 7, 301_500_000n);
  assert.equal(p.gross, 1_750_000n);
  assert.equal(p.fee, 17_500n);
  assert.equal(p.net, 1_741_250n);
  assert.equal(p.net + p.fee + p.back, 301_500_000n);
});

function log(name: string, args: Record<string, unknown>, data: Hex): Log {
  const topics = encodeEventTopics({ abi: timeEscrowAbi, eventName: name as never, args: args as never }) as [Hex, ...Hex[]];
  return { address: ESCROW, topics, data, blockHash: null, blockNumber: null, logIndex: null, transactionHash: null, transactionIndex: null, removed: false } as unknown as Log;
}
const receipt = (logs: Log[], status: 'success' | 'reverted' = 'success') => ({ status, logs }) as unknown as TransactionReceipt;
const enc = (types: string[], values: unknown[]) => encodeAbiParameters(types.map((type) => ({ type })), values as never);

test('an offer is proved by the exact terms and week 1 funded in full', () => {
  const termsHash = timeTermsHash(fixed);
  const r = receipt([
    log('EngagementOffered', { id: ID, employer: HIRER, worker: WORKER }, enc(['bytes32'], [termsHash])),
    log('CycleFunded', { id: ID, cycle: 0 }, enc(['uint256', 'uint256'], [301_500_000n, 0n])),
  ]);
  assert.equal(proveOffered(r, { escrow: ESCROW, employer: HIRER, worker: WORKER, termsHash, total: 301_500_000n }), ID);
  assert.throws(() => proveOffered(r, { escrow: ESCROW, employer: HIRER, worker: WORKER, termsHash, total: 1n }), /CycleFunded/);
  assert.throws(() => proveOffered(receipt([], 'reverted'), { escrow: ESCROW, employer: HIRER, worker: WORKER, termsHash, total: 1n }), /reverted/);
});

test('approval and settle report what the worker was paid and what went back', () => {
  const paid = log('Paid', { dealId: ID, to: WORKER }, enc(['uint256', 'bool'], [186_562_500n, false]));
  const approved = receipt([log('UnitsApproved', { id: ID, cycle: 0 }, enc(['uint32'], [750])), paid]);
  assert.equal(proveApproved(approved, { escrow: ESCROW, id: ID, k: 0, units: 750, worker: WORKER }), 186_562_500n);
  assert.throws(() => proveApproved(approved, { escrow: ESCROW, id: ID, k: 0, units: 751, worker: WORKER }), /UnitsApproved/);
  const settled = receipt([log('CycleSettled', { id: ID, cycle: 0 }, enc(['uint256', 'uint256', 'bool'], [187_500_000n, 113_062_500n, false]))]);
  assert.deepEqual(proveSettled(settled, { escrow: ESCROW, id: ID, k: 0, worker: WORKER }), { gross: 187_500_000n, back: 113_062_500n, paidNow: 0n });
});
