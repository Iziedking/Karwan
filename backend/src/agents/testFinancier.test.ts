import assert from 'node:assert/strict';
import test from 'node:test';
import type { Hex } from 'viem';
import type { DirectDeal } from '../db/deals.js';
import { answerRequest, requestsDue, TEST_FINANCIER_WAIT_MS, type TestFinancierDeps } from './testFinancier.js';

/// The Karwan test financier (owner, 29 Oct 2026; 30 Oct): what the seller
/// asked for up to 80% now, paid back with 3% of the advance, 10% held, offered
/// about two hours after the ask so the partners go first.

const ME: Hex = '0x7e57000000000000000000000000000000007e57';
const NOW = 1_800_000_000_000;

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

const deal = (over: Partial<DirectDeal> = {}) =>
  ({
    jobId: '0xjob',
    seller: '0x5e',
    escrowVersion: 'suite',
    factoringRequestedAt: NOW - TEST_FINANCIER_WAIT_MS,
    factoringRequestedAdvanceUsdc: '150',
    ...over,
  }) as DirectDeal;

test('a seller who asks for all of 150 is offered 120 now, 123.60 back, 12 held', async () => {
  const { d, offers } = deps();
  await answerRequest(d, deal());
  assert.deepEqual(offers, [{ jobId: '0xjob', financier: ME, advance: 120_000_000n, repay: 123_600_000n, stake: 12_000_000n, walletId: 'w-test', expiresInHours: 24 }]);
});

test('a seller who asks for 100 is offered 100 now and 103 back', async () => {
  const { d, offers } = deps();
  await answerRequest(d, deal({ factoringRequestedAdvanceUsdc: '100' }));
  assert.deepEqual(offers, [{ jobId: '0xjob', financier: ME, advance: 100_000_000n, repay: 103_000_000n, stake: 10_000_000n, walletId: 'w-test', expiresInHours: 24 }]);
});

test('no offer when the least the seller takes is above 80%, and it says why once', async () => {
  const { d, offers, logs } = deps();
  await answerRequest(d, deal({ factoringMinAdvanceUsdc: '130' }));
  assert.equal(offers.length, 0);
  assert.equal(logs.length, 1);
});

test('does nothing when the address is not set', async () => {
  const { d, offers } = deps({ address: null });
  await answerRequest(d, deal());
  assert.equal(offers.length, 0);
});

test('skips a deal its wallet cannot cover, and says so', async () => {
  const { d, offers, logs } = deps({ balance: async () => 100_000_000n });
  await answerRequest(d, deal());
  assert.equal(offers.length, 0);
  assert.equal(logs.length, 1);
});

test('never offers twice on one deal', async () => {
  const { d, offers } = deps({ offerOnDeal: async () => true });
  await answerRequest(d, deal());
  assert.equal(offers.length, 0);
});

test('waits about two hours after the ask, so the partners offer first', () => {
  const fresh = deal({ jobId: '0xfresh', factoringRequestedAt: NOW - TEST_FINANCIER_WAIT_MS + 1 });
  const due = deal({ jobId: '0xdue' });
  assert.deepEqual(requestsDue([fresh, due], ME, NOW).map((x) => x.jobId), ['0xdue']);
});

test('only family deals still asking, never its own', () => {
  const skipped = [
    deal({ jobId: '0xold', escrowVersion: 'v2' as DirectDeal['escrowVersion'] }),
    deal({ jobId: '0xnoask', factoringRequestedAt: undefined }),
    deal({ jobId: '0xtaken', factoringOfferId: 'o1' }),
    deal({ jobId: '0xsettled', settledAt: NOW }),
    deal({ jobId: '0xcancelled', cancelledAt: NOW }),
    deal({ jobId: '0xdisputed', disputed: true }),
    deal({ jobId: '0xmine', seller: ME.toUpperCase().replace('0X', '0x') }),
  ];
  assert.deepEqual(requestsDue(skipped, ME, NOW), []);
});
