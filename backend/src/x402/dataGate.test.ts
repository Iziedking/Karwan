import assert from 'node:assert/strict';
import test from 'node:test';
import type { RecordCounts } from '../reputation/recordRead.js';
import type { RecordReadReceipt } from '../db/recordReads.js';
import type { PaidRecordRead } from './buyerClient.js';
import { acquireRecordRead, type DataGateDeps, type PaidEvent } from './dataGate.js';

/// One gate for every paid record read (view 48, decision 6): the same reader,
/// subject and request pay once, unless the record changed.

const counts = (completed: number, disputesLost = 0): RecordCounts => ({ completed, onTimeRate: 1, disputesWon: 0, disputesLost, cancelled: 0 });
const signed = (c: RecordCounts) => ({ counts: c, score: 61 }) as unknown as PaidRecordRead['read'];

const req = { payerAgent: '0xAgent', subject: '0xBuyer', purpose: 'bid' as const, ref: '0xreq', forAccount: '0xOwner' };

function harness(opts: { kept?: RecordReadReceipt | null; now?: RecordCounts | Error; payDelayMs?: number } = {}) {
  const paid: PaidEvent[] = [];
  let pays = 0;
  const deps: DataGateDeps = {
    kept: async () => opts.kept ?? null,
    countsNow: async () => {
      if (opts.now instanceof Error) throw opts.now;
      return opts.now ?? counts(3);
    },
    pay: async () => {
      pays += 1;
      if (opts.payDelayMs) await new Promise((r) => setTimeout(r, opts.payDelayMs));
      return { read: signed(counts(3)), amountUsd: 0.01, transaction: '0xtx', payer: '0xpayer' };
    },
    emit: (e) => paid.push(e),
    now: () => 1_000_000,
  };
  return { deps, paid, pays: () => pays };
}

const keptRead = (c: RecordCounts): RecordReadReceipt => ({
  id: 'r1', reader: '0xowner', subject: '0xbuyer', purpose: 'bid', ref: '0xreq', priceUsdc: 0.01,
  paymentTx: '0xold', scoreAtRead: 61, levelAtRead: 'unverified', detail: signed(c), createdAt: 900_000,
});

test('a read kept for the same reader, subject and request is used again, free', async () => {
  const h = harness({ kept: keptRead(counts(3)) });
  const r = await acquireRecordRead(req, h.deps);
  assert.equal(r.reused, true);
  assert.equal(r.amountUsd, 0);
  assert.equal(h.pays(), 0);
  assert.equal(h.paid.length, 0);
  assert.equal(r.read.counts.completed, 3);
  assert.deepEqual(r.receipt, { amountUsd: 0.01, transaction: '0xold' }, 'the check still shows what it cost, once');
});

test('a record that changed since the kept read is paid for again', async () => {
  const h = harness({ kept: keptRead(counts(2)), now: counts(3) });
  const r = await acquireRecordRead(req, h.deps);
  assert.equal(r.reused, false);
  assert.equal(h.pays(), 1);
});

test('a new lost dispute counts as a change', async () => {
  const h = harness({ kept: keptRead(counts(3)), now: counts(3, 1) });
  assert.equal((await acquireRecordRead(req, h.deps)).reused, false);
});

test('a kept read is used when today’s counts cannot be read', async () => {
  const h = harness({ kept: keptRead(counts(3)), now: new Error('db down') });
  assert.equal((await acquireRecordRead(req, h.deps)).reused, true);
  assert.equal(h.pays(), 0);
});

test('with nothing kept the agent pays, and its owner alone is told', async () => {
  const h = harness();
  const r = await acquireRecordRead(req, h.deps);
  assert.equal(r.reused, false);
  assert.equal(r.amountUsd, 0.01);
  assert.equal(h.paid.length, 1);
  const e = h.paid[0]!;
  assert.equal(e.type, 'agent.paid');
  assert.equal('jobId' in e, false, 'a jobId would show sellers on the request who the buyer checked');
  assert.deepEqual(e.payload, {
    rail: 'arc', kind: 'record', purpose: 'bid', ref: '0xreq', user: '0xOwner', amountUsd: 0.01, txHash: '0xtx', payer: '0xpayer',
  });
  assert.equal(JSON.stringify(e).includes('0xBuyer'), false, 'the person read is never in the event');
});

test('two checks at once for the same request pay once', async () => {
  const h = harness({ payDelayMs: 20 });
  const [a, b] = await Promise.all([acquireRecordRead(req, h.deps), acquireRecordRead({ ...req, forAccount: '0xowner' }, h.deps)]);
  assert.equal(h.pays(), 1);
  assert.equal(a.amountUsd + b.amountUsd, 0.01);
  assert.equal(h.paid.length, 1);
});

test('a failed payment throws and leaves nothing behind for the next check', async () => {
  const h = harness();
  let fail = true;
  const deps: DataGateDeps = { ...h.deps, pay: async (x) => (fail ? Promise.reject(new Error('reads balance not yet credited')) : h.deps.pay(x)) };
  await assert.rejects(acquireRecordRead(req, deps), /reads balance/);
  fail = false;
  assert.equal((await acquireRecordRead(req, deps)).reused, false);
  assert.equal(h.paid.length, 1);
});
