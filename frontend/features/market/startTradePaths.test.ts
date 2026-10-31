import assert from 'node:assert/strict';
import test from 'node:test';
import { startTradePaths } from './startTradePaths';
import { LIVE_FEATURES_OFF, LIVE_FEATURES_QUERY } from '@/shared/liveFeatures';

/// Start a trade offers only what runs on this network (product audit, Batch 1).
///
///   npx tsx --test features/market/startTradePaths.test.ts

test('hourly is offered only when hourly work is live', () => {
  assert.deepEqual(startTradePaths({ hourlyWork: false }), ['buy', 'sell', 'agreement', 'contest']);
  assert.deepEqual(startTradePaths({ hourlyWork: true }), ['buy', 'sell', 'agreement', 'contest', 'hourly']);
});

test('unknown features count as off and refresh within minutes', () => {
  assert.equal(LIVE_FEATURES_QUERY.staleTime, 300_000);
  assert.equal(LIVE_FEATURES_QUERY.refetchOnWindowFocus, true);
  assert.deepEqual(LIVE_FEATURES_OFF, { hourlyWork: false });
});
