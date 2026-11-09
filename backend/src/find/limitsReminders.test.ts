import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedToContact, DAY_MS, LIMITS, NOT_NOW_MS, type ContactCounts } from './limits.js';
import { localAt, nextReminderAt, outOfQuiet } from './reminders.js';

/// Contact limits and reminder times for deal alerts and pitches (view 72).

const clean: ContactCounts = {
  blocked: false, alreadyContacted: false, openOnFind: 0, sentByBuyerToday: 0, receivedBySellerToday: 0,
  pitchesToNeedToday: 0, pitchesBySellerToday: 0, lastPitchAnswer: null,
};
const NOW = Date.UTC(2026, 10, 9, 10);
const alert = (over: Partial<ContactCounts> = {}) => allowedToContact({ ...clean, ...over }, { kind: 'alert', from: '0xbuyer', to: '0xseller', now: NOW });
const pitch = (over: Partial<ContactCounts> = {}) => allowedToContact({ ...clean, ...over }, { kind: 'pitch', from: '0xseller', to: '0xbuyer', now: NOW });

test('every alert limit in the spec', () => {
  assert.deepEqual(alert(), { ok: true, deliverAt: NOW });
  assert.deepEqual(allowedToContact(clean, { kind: 'alert', from: '0xA', to: '0xa', now: NOW }), { ok: false, reason: 'self' });
  assert.deepEqual(alert({ blocked: true }), { ok: false, reason: 'blocked' });
  assert.deepEqual(alert({ alreadyContacted: true }), { ok: false, reason: 'already_contacted' });
  assert.deepEqual(alert({ openOnFind: LIMITS.alertsPerFind }), { ok: false, reason: 'find_full' });
  assert.deepEqual(alert({ sentByBuyerToday: LIMITS.buyerAlertsPerDay }), { ok: false, reason: 'buyer_daily' });
  assert.deepEqual(alert({ receivedBySellerToday: LIMITS.sellerAlertsPerDay }), { ok: true, deliverAt: NOW + DAY_MS }, 'a full seller gets it the next day');
});

test('every pitch limit: not interested is for good, not now for 30 days', () => {
  assert.deepEqual(pitch(), { ok: true, deliverAt: NOW });
  assert.deepEqual(pitch({ lastPitchAnswer: { answer: 'no', at: NOW - 365 * DAY_MS } }), { ok: false, reason: 'not_interested' });
  assert.deepEqual(pitch({ lastPitchAnswer: { answer: 'not_now', at: NOW - DAY_MS } }), { ok: false, reason: 'not_now' });
  assert.equal(pitch({ lastPitchAnswer: { answer: 'not_now', at: NOW - NOT_NOW_MS } }).ok, true);
  assert.deepEqual(pitch({ pitchesBySellerToday: LIMITS.sellerPitchesPerDay }), { ok: false, reason: 'seller_pitch_daily' });
  assert.deepEqual(pitch({ pitchesToNeedToday: LIMITS.buyerPitchesPerNeedPerDay }), { ok: false, reason: 'buyer_pitch_daily' });
  assert.deepEqual(pitch({ alreadyContacted: true }), { ok: false, reason: 'already_contacted' });
});

const LAGOS = 'Africa/Lagos';
const lagos = (d: number, h: number, min = 0) => Date.UTC(2026, 10, d, h - 1, min);
const QUIET = { from: 21, to: 7 };

test('alert reminders in Lagos: two hours on, next morning at 9, next evening at 6, then none', () => {
  const sentAt = lagos(9, 10, 30);
  assert.equal(nextReminderAt({ kind: 'alert', sentAt, reminders: 0 }, LAGOS, QUIET), lagos(9, 12, 30));
  assert.equal(nextReminderAt({ kind: 'alert', sentAt, reminders: 1 }, LAGOS, QUIET), lagos(10, 9));
  assert.equal(nextReminderAt({ kind: 'alert', sentAt, reminders: 2 }, LAGOS, QUIET), lagos(10, 18));
  assert.equal(nextReminderAt({ kind: 'alert', sentAt, reminders: 3 }, LAGOS, QUIET), null);
});

test('quiet hours move a reminder to when they end, never drop it', () => {
  const late = lagos(9, 20, 15);
  assert.equal(nextReminderAt({ kind: 'alert', sentAt: late, reminders: 0 }, LAGOS, QUIET), lagos(10, 7));
  assert.equal(outOfQuiet(lagos(10, 3), LAGOS, QUIET), lagos(10, 7));
  assert.equal(outOfQuiet(lagos(10, 12), LAGOS, QUIET), lagos(10, 12));
  assert.equal(nextReminderAt({ kind: 'alert', sentAt: late, reminders: 0 }, LAGOS, null), lagos(9, 22, 15));
});

test('a pitch is reminded once, the next morning', () => {
  const sentAt = lagos(9, 15);
  assert.equal(nextReminderAt({ kind: 'pitch', sentAt, reminders: 0 }, LAGOS, QUIET), lagos(10, 9));
  assert.equal(nextReminderAt({ kind: 'pitch', sentAt, reminders: 1 }, LAGOS, QUIET), null);
});

test('local times hold across another time zone', () => {
  assert.equal(localAt(Date.UTC(2026, 10, 9, 23), 1, 9, 'Asia/Kolkata'), Date.UTC(2026, 10, 11, 3, 30), 'the next local day there is the 11th');
});
