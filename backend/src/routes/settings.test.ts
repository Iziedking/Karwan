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

test('savesDisplayCurrency: amounts can read in any of the ten currencies', () => {
  for (const displayCurrency of ['USDC', 'NGN', 'USD', 'EUR', 'GBP', 'CNY', 'INR', 'AED', 'KES', 'XOF']) {
    assert.equal(settingsSchema.parse({ settings: { displayCurrency } }).settings.displayCurrency, displayCurrency);
  }
});

test('rejectsUnknownCurrency', () => {
  assert.equal(settingsSchema.safeParse({ settings: { displayCurrency: 'BTC' } }).success, false);
});

test('any other answer is refused', () => {
  assert.throws(() => settingsSchema.parse({ settings: { tradesAs: 'both' } }));
});

test('how we reach you saves as telegram, email or both, and nothing else', () => {
  for (const notifyVia of ['telegram', 'email', 'both']) {
    assert.equal(settingsSchema.safeParse({ settings: { notifyVia } }).success, true);
  }
  assert.equal(settingsSchema.safeParse({ settings: { notifyVia: 'sms' } }).success, false);
});

test('be found and be reached save as settings; a way to meet must be real (view 72)', () => {
  const ok = settingsSchema.parse({ settings: { beFound: true, reachable: true, contactFrom: 'verified', meet: { atMyPlace: true, comeToYouKm: 10, online: false } } });
  assert.equal(ok.settings.beFound, true);
  assert.equal(ok.settings.meet?.comeToYouKm, 10);
  assert.equal(settingsSchema.safeParse({ settings: { meet: { atMyPlace: false, comeToYouKm: null, online: false } } }).success, false);
  assert.equal(settingsSchema.safeParse({ settings: { meet: { atMyPlace: true, comeToYouKm: 500, online: false } } }).success, false);
  assert.equal(settingsSchema.safeParse({ settings: { contactFrom: 'friends' } }).success, false);
});

test('how the guide shows saves as on, face or off, and nothing else (view 57)', () => {
  for (const guide of ['on', 'face', 'off']) {
    assert.equal(settingsSchema.parse({ settings: { guide } }).settings.guide, guide);
  }
  assert.equal(settingsSchema.safeParse({ settings: { guide: 'loud' } }).success, false);
});

test('what Aman remembers on the account saves, and nothing outside its shape (view 57, 15 Nov evening)', () => {
  const ok = settingsSchema.parse({ settings: {
    guideSnooze: { telegram: { until: 1, count: 1 } },
    guideMomentAt: 1_763_200_000_000,
    guideHelloOn: '2026-11-15',
    guideAskedOn: '2026-11-15',
    guideAskedStep: 'telegram',
    guideTourOffer: 'off',
  } }).settings;
  assert.equal(ok.guideTourOffer, 'off');
  assert.equal(ok.guideSnooze?.telegram?.count, 1);
  assert.equal(settingsSchema.safeParse({ settings: { guideSnooze: { lunch: { until: 1, count: 1 } } } }).success, false);
  assert.equal(settingsSchema.safeParse({ settings: { guideHelloOn: '15/11/2026' } }).success, false);
  assert.equal(settingsSchema.safeParse({ settings: { guideTourOffer: 'on' } }).success, false);
  assert.equal(settingsSchema.safeParse({ settings: { guideAskedStep: 'lunch' } }).success, false);
  // New here (view 57, 17 Nov): Not now is kept on the account; old rows keep their tour answer.
  assert.equal(settingsSchema.parse({ settings: { guideNewHere: 'off' } }).settings.guideNewHere, 'off');
  assert.equal(settingsSchema.safeParse({ settings: { guideNewHere: 'on' } }).success, false);
});

test('settings keep visits, heard parts, the hello and the check-in (view 57, 19 Nov)', () => {
  const ok = settingsSchema.parse({ settings: { guideVisits: { '/app': 3, '/deals/*': 1 }, guideHeard: ['home-money'], guideHi: 'done', guideCheckInAt: 1 } });
  assert.deepEqual(ok.settings.guideVisits, { '/app': 3, '/deals/*': 1 });
  assert.deepEqual(ok.settings.guideHeard, ['home-money']);
  assert.equal(ok.settings.guideHi, 'done');
  assert.equal(ok.settings.guideCheckInAt, 1);
});

test('settings refuse junk in what Aman remembers (view 57, 19 Nov)', () => {
  const bad = (settings: Record<string, unknown>) => assert.equal(settingsSchema.safeParse({ settings }).success, false, JSON.stringify(settings).slice(0, 80));
  bad({ guideVisits: { '/App': 1 } });
  bad({ guideVisits: { '/app': -1 } });
  bad({ guideVisits: { '/app': 1.5 } });
  bad({ guideVisits: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`/p${i}`, 1])) });
  bad({ guideHeard: ['Home Money'] });
  bad({ guideHeard: Array.from({ length: 301 }, (_, i) => `part-${i}`) });
  bad({ guideHi: 'yes' });
  bad({ guideCheckInAt: -5 });
});
