import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadTrustCard,
  __clearTrustCardCacheForTests,
  __trustCardCacheSizeForTests,
} from './loadTrustCard.js';

const SUBJECT = `0x${'44'.repeat(20)}`;
const ctx = { dealAmountUsdc: '100', subjectPersonVerified: false };

test('the per-subject lookup is cached by subject and role, not repeated per call', async () => {
  __clearTrustCardCacheForTests();
  await loadTrustCard(SUBJECT, 'seller', ctx);
  assert.equal(__trustCardCacheSizeForTests(), 1);
  await loadTrustCard(SUBJECT, 'seller', ctx);
  assert.equal(__trustCardCacheSizeForTests(), 1, 'a second call for the same subject+role reuses the cached entry');
  await loadTrustCard(SUBJECT, 'buyer', ctx);
  assert.equal(__trustCardCacheSizeForTests(), 2, 'role is part of the cache key');
  await loadTrustCard(SUBJECT.toUpperCase(), 'seller', ctx);
  assert.equal(__trustCardCacheSizeForTests(), 2, 'the key is lowercased, so casing does not fragment the cache');
});

test('deal-specific fields are never cached: stake and personVerified vary per call', async () => {
  __clearTrustCardCacheForTests();
  const unstaked = await loadTrustCard(SUBJECT, 'seller', {
    dealAmountUsdc: '100', subjectPersonVerified: false,
  });
  assert.equal(unstaked.stakeUsdc, null);
  assert.equal(unstaked.verifiedPerson, false);

  const staked = await loadTrustCard(SUBJECT, 'seller', {
    dealAmountUsdc: '100', acceptedAt: Date.now(), requireStake: true, requireStakePct: 60, subjectPersonVerified: true,
  });
  assert.equal(staked.stakeUsdc, '60');
  assert.equal(staked.verifiedPerson, true);
  // Same subject+role, so the per-subject part still came from one cached entry.
  assert.equal(__trustCardCacheSizeForTests(), 1);
});
