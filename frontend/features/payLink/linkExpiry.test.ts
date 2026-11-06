import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EXPIRY, EXPIRY_DAYS, MAX_EXPIRY_DAYS, dateBounds, expiryAt, expiryMinutes } from './linkExpiry';

const now = new Date(2026, 10, 6, 15, 30).getTime();

test('a link lasts 7 days unless the person picks, and the choices stop at 90 days', () => {
  assert.deepEqual(DEFAULT_EXPIRY, { kind: 'days', days: 7 });
  assert.deepEqual([...EXPIRY_DAYS], [1, 7, 30]);
  assert.equal(MAX_EXPIRY_DAYS, 90);
  assert.equal(expiryMinutes({ kind: 'days', days: 30 }, now), 30 * 24 * 60);
});

test('a picked date means the link works to the end of that day', () => {
  const end = new Date(2027, 0, 6, 23, 59, 59).getTime();
  assert.equal(expiryMinutes({ kind: 'date', date: '2027-01-06' }, now), Math.ceil((end - now) / 60_000));
  assert.equal(expiryAt({ kind: 'date', date: '2027-01-06' }, now), now + Math.ceil((end - now) / 60_000) * 60_000);
});

test('a date past 90 days or in the past is held to the limits', () => {
  assert.equal(expiryMinutes({ kind: 'date', date: '2028-01-01' }, now), MAX_EXPIRY_DAYS * 24 * 60);
  assert.equal(expiryMinutes({ kind: 'date', date: '2026-11-01' }, now), 5);
});

test('the calendar opens on tomorrow and ends on day 90, in local dates', () => {
  assert.deepEqual(dateBounds(now), { min: '2026-11-07', max: '2027-02-03' });
});
