import test from 'node:test';
import { memoryRequestLeaseStore } from './requestLeases.js';
import { leaseChecks } from './requestLeasesContract.js';

test('the memory lease store: one holder at a time, renewed, expired, released', async () => {
  await leaseChecks(memoryRequestLeaseStore());
});
