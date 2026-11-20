import assert from 'node:assert/strict';
import test from 'node:test';
import { sinceFor } from './listedWindow.js';

// 20 Nov 2026 00:10 in Lagos (UTC+1) is 19 Nov 23:10 UTC.
const LAGOS_0010 = Date.UTC(2026, 10, 19, 23, 10, 0);
const LAGOS_2359 = Date.UTC(2026, 10, 20, 22, 59, 0);
const LAGOS_MIDNIGHT = Date.UTC(2026, 10, 19, 23, 0, 0);

test('today starts at local midnight, all day long', () => {
  assert.equal(sinceFor('today', LAGOS_0010, 'Africa/Lagos'), LAGOS_MIDNIGHT);
  assert.equal(sinceFor('today', LAGOS_2359, 'Africa/Lagos'), LAGOS_MIDNIGHT);
});

test('a listing at 23:30 Lagos on the 19th is not today on the 20th', () => {
  const posted = Date.UTC(2026, 10, 19, 22, 30, 0);
  assert.ok(posted < (sinceFor('today', LAGOS_0010, 'Africa/Lagos') as number));
});

test('the last hour, week and month count back from now; any time keeps all', () => {
  const now = LAGOS_2359;
  assert.equal(sinceFor('1h', now, 'Africa/Lagos'), now - 3_600_000);
  assert.equal(sinceFor('week', now, 'Africa/Lagos'), now - 7 * 86_400_000);
  assert.equal(sinceFor('month', now, 'Africa/Lagos'), now - 30 * 86_400_000);
  assert.equal(sinceFor('any', now, 'Africa/Lagos'), null);
});

test('an unknown time zone reads as UTC', () => {
  assert.equal(sinceFor('today', Date.UTC(2026, 10, 20, 5, 0, 0), 'Not/AZone'), Date.UTC(2026, 10, 20, 0, 0, 0));
});
