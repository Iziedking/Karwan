import assert from 'node:assert/strict';
import test from 'node:test';
import { partyMayPublish } from './policy.js';

///   npx tsx --test src/attestation/policy.test.ts

test('no switch-on date means nothing is published', () => {
  assert.deepEqual(partyMayPublish({ settledAt: 5, startAt: undefined, settings: {} }), { ok: false, reason: 'not switched on' });
});

test('a deal settled on or after switch-on publishes by default', () => {
  assert.deepEqual(partyMayPublish({ settledAt: 10, startAt: 10, settings: undefined }), { ok: true });
});

test('turning publishing off stops it', () => {
  assert.deepEqual(partyMayPublish({ settledAt: 20, startAt: 10, settings: { publishDeals: false } }), { ok: false, reason: 'opted out' });
});

test('earlier deals publish only for people who ask', () => {
  assert.deepEqual(partyMayPublish({ settledAt: 5, startAt: 10, settings: {} }), { ok: false, reason: 'before switch-on' });
  assert.deepEqual(partyMayPublish({ settledAt: 5, startAt: 10, settings: { publishHistory: true } }), { ok: true });
  assert.deepEqual(partyMayPublish({ settledAt: 5, startAt: 10, settings: { publishHistory: true, publishDeals: false } }), { ok: false, reason: 'opted out' });
});

test("each party's own choice decides their own statement", () => {
  const buyer = partyMayPublish({ settledAt: 20, startAt: 10, settings: { publishDeals: false } });
  const seller = partyMayPublish({ settledAt: 20, startAt: 10, settings: undefined });
  assert.equal(buyer.ok, false);
  assert.equal(seller.ok, true);
});

test('the switch-on date must be in milliseconds, so a date in seconds is refused at startup', async () => {
  const { startAtSchema } = await import('./policy.js');
  assert.equal(startAtSchema.safeParse('1760659200').success, false, 'seconds');
  assert.equal(startAtSchema.safeParse('1760659200000').data, 1760659200000);
  assert.equal(startAtSchema.safeParse('').data, undefined);
  assert.equal(startAtSchema.safeParse(undefined).data, undefined);
});

test('config reads the switch-on date through that schema', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../config.ts', import.meta.url), 'utf8'), /ATTESTATION_START_AT: startAtSchema,/);
});
