import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import type { DirectDeal } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { primeCreatedDirectDeal } from './creationHandoff';

const viewer = '0x1111111111111111111111111111111111111111';
const seller = '0x2222222222222222222222222222222222222222';

function createdDeal(jobId: string): DirectDeal {
  return {
    jobId,
    buyer: viewer,
    seller,
    dealAmountUsdc: '20',
    firstReleasePct: 50,
    terms: 'Ship the agreed work',
    delivered: false,
    createdAt: 1,
    updatedAt: 1,
    onChain: null,
  };
}

test('a confirmed creation primes the detail and list before navigation', () => {
  const cache = new QueryClient();
  const older = createdDeal('0xolder');
  const created = createdDeal('0xcreated');
  cache.setQueryData(qk.deals.list(viewer), [older]);

  primeCreatedDirectDeal(cache, created, viewer.toUpperCase());

  assert.deepEqual(cache.getQueryData(qk.deals.item(created.jobId, viewer)), created);
  assert.deepEqual(cache.getQueryData(qk.deals.list(viewer)), [created, older]);
});

test('priming is idempotent and keeps the new deal first', () => {
  const cache = new QueryClient();
  const created = createdDeal('0xcreated');

  primeCreatedDirectDeal(cache, created, viewer);
  primeCreatedDirectDeal(cache, { ...created, updatedAt: 2 }, viewer);

  const list = cache.getQueryData<DirectDeal[]>(qk.deals.list(viewer));
  assert.equal(list?.length, 1);
  assert.equal(list?.[0]?.updatedAt, 2);
});

