import assert from 'node:assert/strict';
import test from 'node:test';
import { badgeAccessibleLabel, dealCountLine } from './badgeLabel';

const copy = { dealCountOneTemplate: '{count} deal', dealCountManyTemplate: '{count} deals' };

test('badgeAccessibleLabel: tier and deal count', () => {
  assert.equal(badgeAccessibleLabel('Strong', 12, copy), 'Strong. 12 deals');
  assert.equal(badgeAccessibleLabel('New', 1, copy), 'New. 1 deal');
  assert.equal(badgeAccessibleLabel('New', 0, copy), 'New. 0 deals');
});

test('badgeAccessibleLabel: leaves the count out when it is not a number', () => {
  assert.equal(badgeAccessibleLabel('Watchlist', undefined, copy), 'Watchlist');
  assert.equal(badgeAccessibleLabel('Watchlist', null, copy), 'Watchlist');
  assert.equal(badgeAccessibleLabel('Watchlist', Number.NaN, copy), 'Watchlist');
  assert.equal(dealCountLine(undefined, copy), null);
});
