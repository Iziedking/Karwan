import assert from 'node:assert/strict';
import test from 'node:test';
import { hiddenGuideIds, liveFeaturesFrom } from './features.js';

/// Features switched off on a network are never offered (product audit, Batch 1).
///
///   npx tsx --test src/features.test.ts

test('hourly work is live only when both the engagements and the market requests are bound', () => {
  assert.equal(liveFeaturesFrom({ work: null, workRequests: null }).hourlyWork, false);
  assert.equal(liveFeaturesFrom({ work: {}, workRequests: null }).hourlyWork, false);
  assert.equal(liveFeaturesFrom({ work: {}, workRequests: {} }).hourlyWork, true);
});

test('the guide hides the hourly entry while hourly work is off', () => {
  assert.deepEqual(hiddenGuideIds({ hourlyWork: false }), ['hourly-work']);
  assert.deepEqual(hiddenGuideIds({ hourlyWork: true }), []);
});
