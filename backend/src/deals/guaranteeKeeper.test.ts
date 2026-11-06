import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGREEMENT,
  guaranteeNeed,
  guaranteeStep,
  KEEP_TRIES_BEFORE_HOLD,
  runGuaranteePass,
  type GuaranteeHold,
  type GuaranteeRead,
  type GuaranteeDeps,
} from './guaranteeKeeper.js';

///   npx tsx --test src/deals/guaranteeKeeper.test.ts

const DAY = 86_400n;
const NOW = 1_800_000_000n;
const HORIZON = NOW + 20n * DAY;
const NEED = HORIZON + 210n * DAY;

function read(over: Partial<GuaranteeRead> = {}): GuaranteeRead {
  return { state: AGREEMENT.Accepted, sellerStake: 20_000_000n, horizon: HORIZON, expiry: NEED, ...over };
}

test('a guarantee must outlast the deal horizon by 180 days plus 30, as the escrow keeps it', () => {
  assert.equal(guaranteeNeed(HORIZON), NEED);
});

test('the next step for each guarantee', () => {
  assert.deepEqual(guaranteeStep(read(), NOW), { kind: 'none' });
  assert.deepEqual(guaranteeStep(read({ sellerStake: 0n, expiry: 0n }), NOW), { kind: 'none' });
  assert.deepEqual(guaranteeStep(read({ expiry: NEED - 1n }), NOW), { kind: 'keep' });
  assert.deepEqual(guaranteeStep(read({ state: AGREEMENT.Disputed, expiry: NEED - DAY }), NOW), { kind: 'keep' });
  assert.deepEqual(guaranteeStep(read({ expiry: 0n }), NOW), { kind: 'lapsed' }, 'an open deal whose guarantee is no longer reserved');
  assert.deepEqual(guaranteeStep(read({ expiry: NOW - 1n }), NOW), { kind: 'lapsed' }, 'the vault no longer extends a reservation that ran out');
  assert.deepEqual(guaranteeStep(read({ state: AGREEMENT.Funded, expiry: 0n }), NOW), { kind: 'none' }, 'no guarantee before the seller accepts');
  for (const closed of [AGREEMENT.Settled, AGREEMENT.Refunded, AGREEMENT.Reclaimed, AGREEMENT.Split, AGREEMENT.Ruled, AGREEMENT.Longstopped]) {
    assert.deepEqual(guaranteeStep(read({ state: closed, expiry: 0n }), NOW), { kind: 'none' });
    assert.deepEqual(guaranteeStep(read({ state: closed, expiry: NOW + DAY }), NOW), { kind: 'waitFree', freesAt: NOW + DAY });
    assert.deepEqual(guaranteeStep(read({ state: closed, expiry: NOW - 1n }), NOW), { kind: 'releaseStale' });
  }
});

function harness(reads: Record<string, GuaranteeRead>, opts: { keepWorks?: boolean; failedPayouts?: Array<{ dealId: string; txHash: string }> } = {}) {
  const holds = new Map<string, GuaranteeHold>();
  const calls: string[] = [];
  const alerts: string[] = [];
  const deps: GuaranteeDeps = {
    deals: async () => Object.keys(reads).map((dealId) => ({ jobId: `job-${dealId}`, dealId })),
    read: async (dealId) => reads[dealId]!,
    keep: async (dealId) => {
      calls.push(`keep:${dealId}`);
      if (opts.keepWorks) reads[dealId] = { ...reads[dealId]!, expiry: guaranteeNeed(reads[dealId]!.horizon) };
    },
    releaseStale: async (dealId) => {
      calls.push(`releaseStale:${dealId}`);
      reads[dealId] = { ...reads[dealId]!, expiry: 0n };
    },
    failedPayouts: async () => opts.failedPayouts ?? [],
    getHold: async (dealId) => holds.get(dealId) ?? null,
    putHold: async (h) => void holds.set(h.dealId, h),
    clearHold: async (dealId) => void holds.delete(dealId),
    alert: async (text) => void alerts.push(text),
    now: () => Number(NOW) * 1000,
  };
  return { deps, holds, calls, alerts };
}

test('a short reservation is kept, and a kept one needs nothing more', async () => {
  const h = harness({ d1: read({ expiry: NEED - DAY }) }, { keepWorks: true });
  const report = await runGuaranteePass(h.deps);
  assert.deepEqual(h.calls, ['keep:d1']);
  assert.deepEqual(report.kept, ['d1']);
  assert.equal(h.holds.size, 0);
  await runGuaranteePass(h.deps);
  assert.deepEqual(h.calls, ['keep:d1']);
});

test('a keep still short after three passes goes to a person, alerted once', async () => {
  const h = harness({ d1: read({ expiry: NEED - DAY }) }, { keepWorks: false });
  for (let i = 0; i < KEEP_TRIES_BEFORE_HOLD + 2; i++) await runGuaranteePass(h.deps);
  assert.equal(h.calls.length, KEEP_TRIES_BEFORE_HOLD + 2, 'it keeps trying while the reservation lasts');
  assert.equal(h.holds.get('d1')?.reason, 'GUARANTEE_KEEP_FAILED');
  assert.equal(h.holds.get('d1')?.keepFailures, KEEP_TRIES_BEFORE_HOLD + 2);
  assert.equal(h.alerts.length, 1);
  assert.match(h.alerts[0]!, /job-d1/);
});

test('a closed deal frees its guarantee once the reservation runs out, and waits for a person until then', async () => {
  const h = harness({
    early: read({ state: AGREEMENT.Settled, expiry: NOW + 5n * DAY }),
    late: read({ state: AGREEMENT.Settled, expiry: NOW - 1n }),
  });
  const report = await runGuaranteePass(h.deps);
  assert.deepEqual(h.calls, ['releaseStale:late']);
  assert.deepEqual(report.freed, ['late']);
  assert.equal(h.holds.get('early')?.reason, 'GUARANTEE_NOT_FREED');
  assert.equal(h.holds.get('early')?.freesAt, Number(NOW + 5n * DAY) * 1000);
  assert.equal(h.holds.has('late'), false);
});

test('a hold clears by itself once the chain no longer needs anything', async () => {
  const reads = { d1: read({ state: AGREEMENT.Settled, expiry: NOW + DAY }) };
  const h = harness(reads);
  await runGuaranteePass(h.deps);
  assert.equal(h.holds.size, 1);
  reads.d1 = read({ state: AGREEMENT.Settled, expiry: 0n });
  await runGuaranteePass(h.deps);
  assert.equal(h.holds.size, 0);
});

test('a lapsed guarantee and a failed payment to the buyer are held for a person and never cleared by the pass', async () => {
  const h = harness(
    { d1: read({ expiry: 0n }), d2: read({ state: AGREEMENT.Ruled, expiry: 0n }) },
    { failedPayouts: [{ dealId: 'd2', txHash: '0xrule' }] },
  );
  await runGuaranteePass(h.deps);
  await runGuaranteePass(h.deps);
  assert.equal(h.holds.get('d1')?.reason, 'GUARANTEE_LAPSED');
  assert.equal(h.holds.get('d2')?.reason, 'GUARANTEE_PAYOUT_FAILED');
  assert.equal(h.holds.get('d2')?.txHash, '0xrule');
  assert.equal(h.alerts.length, 2, 'one alert each, not one per pass');
  assert.deepEqual(h.calls, [], 'nothing on chain can fix either');
});

test('a failed payment record for a deal Karwan does not know is still held, by its escrow id', async () => {
  const h = harness({}, { failedPayouts: [{ dealId: '0xunknown', txHash: '0xt' }] });
  await runGuaranteePass(h.deps);
  assert.equal(h.holds.get('0xunknown')?.reason, 'GUARANTEE_PAYOUT_FAILED');
  assert.equal(h.holds.get('0xunknown')?.jobId, null);
});

test('one deal that fails to read never stops the others', async () => {
  const h = harness({ ok: read({ expiry: NEED - DAY }) }, { keepWorks: true });
  const deals = h.deps.deals;
  h.deps.deals = async () => [{ jobId: 'job-bad', dealId: 'bad' }, ...(await deals())];
  const readOk = h.deps.read;
  h.deps.read = async (id) => (id === 'bad' ? Promise.reject(new Error('rpc')) : readOk(id));
  const report = await runGuaranteePass(h.deps);
  assert.deepEqual(report.kept, ['ok']);
  assert.deepEqual(report.errors, ['bad']);
});
