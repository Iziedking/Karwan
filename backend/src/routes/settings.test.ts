import assert from 'node:assert/strict';
import test from 'node:test';
import { settingsSchema } from './settings.js';

/// The settings a person can save. `tradesAs` is the one-time answer at the
/// market's entry (view 17): for myself or for a business.
///
///   npx tsx --test src/routes/settings.test.ts

test('trading for yourself or for a business is saved as a setting', () => {
  assert.equal(settingsSchema.parse({ settings: { tradesAs: 'self' } }).settings.tradesAs, 'self');
  assert.equal(settingsSchema.parse({ settings: { tradesAs: 'business' } }).settings.tradesAs, 'business');
});

test('any other answer is refused', () => {
  assert.throws(() => settingsSchema.parse({ settings: { tradesAs: 'both' } }));
});
