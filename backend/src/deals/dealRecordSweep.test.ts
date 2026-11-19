import assert from 'node:assert/strict';
import test from 'node:test';
import type { DealRecordProof } from '../attestation/dealRecordProof.js';
import type { StoredDealRecord } from '../db/dealRecords.js';
import type { DirectDeal } from '../db/deals.js';
import type { DealRecord } from './dealRecord.js';
import { writeDealRecords, type DealRecordSweepDeps } from './dealRecordSweep.js';

/// The sweep (view 94): every ended deal gets one signed record, older deals
/// too, and a second pass writes nothing.
///
///   npx tsx --test src/deals/dealRecordSweep.test.ts

const T = 1_763_500_000_000;
const job = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

const deal = (n: number, over: Partial<DirectDeal> = {}): DirectDeal =>
  ({
    jobId: job(n),
    buyer: '0x1111111111111111111111111111111111111111',
    seller: '0x2222222222222222222222222222222222222222',
    dealAmountUsdc: '100',
    firstReleasePct: 100,
    terms: 'A navy suit',
    createdAt: T,
    ...over,
  }) as DirectDeal;

const proof: DealRecordProof = {
  type: 'eip712',
  primaryType: 'KarwanDealRecord',
  domain: { name: 'Karwan', version: '1', chainId: 5042002 },
  issuer: '0x3333333333333333333333333333333333333333',
  signature: '0xabcd',
};

function harness(deals: DirectDeal[], keyReady = true) {
  const stored = new Map<string, StoredDealRecord>();
  const logs: string[] = [];
  const deps: DealRecordSweepDeps = {
    deals: async () => deals,
    recorded: async (ids) => new Set(ids.filter((id) => stored.has(id.toLowerCase()))),
    movements: async () => [],
    events: async () => [],
    sign: async (record: DealRecord) => (keyReady ? { digest: `0x${record.jobId.slice(-4)}`, proof } : null),
    save: async (row) => {
      const id = row.jobId.toLowerCase();
      if (stored.has(id)) return false;
      stored.set(id, row);
      return true;
    },
    now: () => T + 5_000,
    log: (msg) => logs.push(msg),
  };
  return { deps, stored, logs };
}

test('writes one record per ended deal, settled or cancelled', async () => {
  const h = harness([deal(1, { settledAt: T + 1_000 }), deal(2, { cancelledAt: T + 2_000, cancelKind: 'mutual' })]);
  const r = await writeDealRecords(h.deps);
  assert.equal(r.written, 2);
  assert.equal(h.stored.size, 2);
  const first = h.stored.get(job(1))!;
  assert.equal(first.record.ended, 'settled');
  assert.equal(first.writtenAt, T + 5_000);
  assert.equal(first.digest, `0x${job(1).slice(-4)}`);
  assert.deepEqual(first.proof, proof);
});

test('skips deals that are still open', async () => {
  const h = harness([deal(1), deal(2, { settledAt: T + 1_000 })]);
  const r = await writeDealRecords(h.deps);
  assert.equal(r.written, 1);
  assert.equal(h.stored.has(job(1)), false);
});

test('skips a deal whose other side never claimed the invite', async () => {
  const h = harness([deal(1, { cancelledAt: T + 1_000, pendingCounterparty: { kind: 'email' } as DirectDeal['pendingCounterparty'] })]);
  const r = await writeDealRecords(h.deps);
  assert.equal(r.written, 0);
  assert.equal(r.skipped, 1);
});

test('no issuer key: nothing written and one log line', async () => {
  const h = harness([deal(1, { settledAt: T + 1_000 }), deal(2, { settledAt: T + 2_000 })], false);
  const r = await writeDealRecords(h.deps);
  assert.equal(r.written, 0);
  assert.equal(h.stored.size, 0);
  assert.equal(h.logs.length, 1);
});

test('a second run writes nothing', async () => {
  const h = harness([deal(1, { settledAt: T + 1_000 })]);
  await writeDealRecords(h.deps);
  const again = await writeDealRecords(h.deps);
  assert.equal(again.written, 0);
  assert.equal(h.stored.size, 1);
});

test('one deal that fails does not stop the others', async () => {
  const h = harness([deal(1, { settledAt: T + 1_000 }), deal(2, { settledAt: T + 2_000 })]);
  const read = h.deps.movements;
  h.deps.movements = async (jobId) => {
    if (jobId === job(1)) throw new Error('read failed');
    return read(jobId);
  };
  const r = await writeDealRecords(h.deps);
  assert.equal(r.written, 1);
  assert.equal(r.skipped, 1);
  assert.equal(h.stored.has(job(2)), true);
});
