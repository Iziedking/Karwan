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

test('research is quoted from what is cached, paid by the agent, and its owner alone is told', async () => {
  const { acquireResearch } = await import('./dataGate.js');
  const told: PaidEvent[] = [];
  let priced = -1;
  const r = await acquireResearch(
    { payerAgent: '0xAgent', forAccount: '0xOwner', keywords: ['tailoring'], focus: 'price', ref: '0xreq' },
    {
      cachedAngles: () => new Set(['pricing']),
      pay: async (_agent, o) => {
        priced = o.priceUsd;
        return { read: { demand: 'steady' } as never, quote: { focus: 'price', angles: ['pricing', 'marketplace-rates'], fresh: 1, cached: 1, totalUsdc: 0.009 }, amountUsd: 0.009, transaction: '0xtx', payer: '0xpayer' };
      },
      emit: (e) => told.push(e),
    },
  );
  assert.equal(priced, 0.009, 'the top-up covers the exact quote');
  assert.equal(r.quote.totalUsdc, 0.009);
  assert.equal(told.length, 1);
  assert.equal('jobId' in told[0]!, false);
  assert.deepEqual(told[0]!.payload, {
    rail: 'arc', kind: 'research', focus: 'price', angles: ['pricing', 'marketplace-rates'], ref: '0xreq', user: '0xOwner', amountUsd: 0.009, txHash: '0xtx', payer: '0xpayer',
  });
});

test('a short balance reaches the caller so the person is asked to add money', async () => {
  const { acquireResearch } = await import('./dataGate.js');
  await assert.rejects(
    acquireResearch(
      { payerAgent: '0xAgent', forAccount: '0xOwner', keywords: ['tailoring'], focus: 'demand', ref: '0xreq' },
      { cachedAngles: () => new Set(), pay: async () => Promise.reject(new Error('reads balance not yet credited (available 0 USDC)')), emit: () => undefined },
    ),
    /reads balance/,
  );
});

test('over the weekly budget nothing is paid, the owner is told, and the reason is given', async () => {
  const h = harness();
  const told: string[] = [];
  const deps: DataGateDeps = { ...h.deps, budget: { fits: async () => false, spent: async () => undefined, reached: (o) => told.push(o) } };
  await assert.rejects(acquireRecordRead(req, deps), /weekly data budget/);
  assert.equal(h.pays(), 0);
  assert.deepEqual(told, ['0xOwner']);
});

test('a payment is added to the owner\u2019s spend', async () => {
  const h = harness();
  const spent: Array<[string, number, string]> = [];
  const deps: DataGateDeps = { ...h.deps, budget: { fits: async () => true, spent: async (o, usd, kind) => { spent.push([o, usd, kind]); }, reached: () => undefined } };
  await acquireRecordRead(req, deps);
  assert.deepEqual(spent, [['0xOwner', 0.01, 'record']]);
});

test('research over the budget is refused before anything runs', async () => {
  const { acquireResearch } = await import('./dataGate.js');
  let ran = false;
  await assert.rejects(
    acquireResearch(
      { payerAgent: '0xAgent', forAccount: '0xOwner', keywords: ['rice'], focus: 'full', ref: '0xreq' },
      { cachedAngles: () => new Set(), pay: async () => { ran = true; throw new Error('no'); }, emit: () => undefined, budget: { fits: async () => false, spent: async () => undefined, reached: () => undefined } },
    ),
    /weekly data budget/,
  );
  assert.equal(ran, false);
});

test('one match costs a seller one check at 0.005 USDC, a buyer at most five (owner, 5 Nov 2026)', async () => {
  const { RECORD_READ_PRICE_USDC, PAID_READS_PER_REQUEST } = await import('./recordReadGate.js');
  assert.equal(RECORD_READ_PRICE_USDC, 0.005);
  assert.deepEqual(PAID_READS_PER_REQUEST, { bid: 1, shortlist: 5 });
  assert.equal(RECORD_READ_PRICE_USDC * PAID_READS_PER_REQUEST.bid, 0.005);
  assert.equal(RECORD_READ_PRICE_USDC * PAID_READS_PER_REQUEST.shortlist, 0.025);
});

test('a check past the request\'s limit is refused before anything is paid', async () => {
  const seller = harness();
  seller.deps.paidOnRequest = async () => 1;
  await assert.rejects(acquireRecordRead(req, seller.deps), /record checks for this request used/);
  assert.equal(seller.pays(), 0);

  const buyer = harness();
  let used = 4;
  buyer.deps.paidOnRequest = async () => used;
  const shortlist = { ...req, purpose: 'shortlist' as const, subject: '0xSeller5' };
  await acquireRecordRead(shortlist, buyer.deps);
  assert.equal(buyer.pays(), 1, 'the fifth is paid');
  used = 5;
  await assert.rejects(acquireRecordRead({ ...shortlist, subject: '0xSeller6' }, buyer.deps), /record checks for this request used/);
  assert.equal(buyer.pays(), 1, 'the sixth is not');
});

test('a kept read is used again even when the request\'s checks are used up', async () => {
  const h = harness({ kept: keptRead(counts(3)) });
  h.deps.paidOnRequest = async () => 1;
  const r = await acquireRecordRead(req, h.deps);
  assert.equal(r.reused, true);
});

test('research that fails tells its owner once per request, and the caller still gets the error (view 52, step 0)', async () => {
  const { acquireResearch } = await import('./dataGate.js');
  const told: PaidEvent[] = [];
  const failing = {
    cachedAngles: () => new Set<string>(),
    pay: async () => Promise.reject(new Error('synthesis timed out')),
    emit: (e: PaidEvent) => told.push(e),
  };
  const ask = () => acquireResearch({ payerAgent: '0xAgent', forAccount: '0xFailOwner', keywords: ['logo'], focus: 'negotiation', ref: '0xfailreq', actor: 'seller' }, failing);
  await assert.rejects(ask(), /synthesis timed out/);
  await assert.rejects(ask(), /synthesis timed out/);
  assert.equal(told.length, 1);
  assert.equal(told[0]!.type, 'agent.research.failed');
  assert.equal(told[0]!.actor, 'seller');
  assert.deepEqual(told[0]!.payload, { kind: 'research', user: '0xFailOwner', ref: '0xfailreq', focus: 'negotiation' });
});

test('a short balance is not told as a research failure', async () => {
  const { tellResearchFailed } = await import('./dataGate.js');
  const told: PaidEvent[] = [];
  const sent = tellResearchFailed(
    { payerAgent: '0xA', forAccount: '0xShort', keywords: [], focus: 'demand', ref: '0xr' },
    new Error('reads balance not yet credited (available 0 USDC)'),
    (e) => told.push(e),
  );
  assert.equal(sent, false);
  assert.equal(told.length, 0);
});
