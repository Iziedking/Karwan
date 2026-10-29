import assert from 'node:assert/strict';
import test from 'node:test';
import type { Hex } from 'viem';
import { handleFamilyRequest, type TestFinancierDeps } from './testFinancier.js';

/// The Karwan test financier offers on every family deal that asks (owner,
/// 29 Oct 2026): 80% now, paid back with 3% of the advance, 10% held.

const ME: Hex = '0x7e57000000000000000000000000000000007e57';

function deps(over: Partial<TestFinancierDeps> = {}) {
  const offers: unknown[] = [];
  const logs: string[] = [];
  const d: TestFinancierDeps = {
    address: ME,
    walletId: 'w-test',
    unpaid: async () => 150_000_000n,
    balance: async () => 1_000_000_000n,
    offerOnDeal: async () => false,
    createFamilyOffer: async (i) => { offers.push(i); return { offer: { id: 'o' } as never }; },
    log: (m) => logs.push(m),
    ...over,
  };
  return { d, offers, logs };
}

const request = { type: 'factoring.requested', jobId: '0xjob', payload: { rail: 'family', seller: '0x5e' } };

test('offers 120 now, 123.60 back, 12 held on a 150 request', async () => {
  const { d, offers } = deps();
  await handleFamilyRequest(d, request);
  assert.deepEqual(offers, [{ jobId: '0xjob', financier: ME, advance: 120_000_000n, repay: 123_600_000n, stake: 12_000_000n, walletId: 'w-test', expiresInHours: 24 }]);
});

test('does nothing when the address is not set', async () => {
  const { d, offers } = deps({ address: null });
  await handleFamilyRequest(d, request);
  assert.equal(offers.length, 0);
});

test('only answers family requests', async () => {
  const { d, offers } = deps();
  await handleFamilyRequest(d, { ...request, payload: { seller: '0x5e' } });
  await handleFamilyRequest(d, { ...request, type: 'factoring.offered' });
  assert.equal(offers.length, 0);
});

test('skips a deal its wallet cannot cover, and says so', async () => {
  const { d, offers, logs } = deps({ balance: async () => 100_000_000n });
  await handleFamilyRequest(d, request);
  assert.equal(offers.length, 0);
  assert.equal(logs.length, 1);
});

test('never offers twice on one deal', async () => {
  const { d, offers } = deps({ offerOnDeal: async () => true });
  await handleFamilyRequest(d, request);
  assert.equal(offers.length, 0);
});

test('never offers on its own request', async () => {
  const { d, offers } = deps();
  await handleFamilyRequest(d, { ...request, payload: { rail: 'family', seller: ME } });
  assert.equal(offers.length, 0);
});
