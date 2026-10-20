import assert from 'node:assert/strict';
import test from 'node:test';
import { kindOf, locationFit, needsDeliveryQuestion, normalizeLocation, publicLocation, servesCountry, type PrivateLocation } from './rules.js';

/// Where people are, where they deliver, and what of it is public.
///
///   npx tsx --test src/location/rules.test.ts

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;

const at = (country: string | null, city: string | null = null, area: string | null = null, reach: PrivateLocation['reach'] = {}): PrivateLocation => ({ country, city, area, reach });
const yaba = at('NG', 'Lagos', 'Yaba');
const ikeja = at('NG', 'Lagos', 'Ikeja');
const abuja = at('NG', 'Abuja');
const accra = at('GH', 'Accra');

test('same area beats same city beats same country beats ships there', () => {
  const near = { scope: 'near' as const };
  assert.equal(locationFit(near, yaba, at('NG', 'lagos', 'yaba'), 'goods'), 4);
  assert.equal(locationFit(near, yaba, ikeja, 'goods'), 3);
  assert.equal(locationFit(near, yaba, abuja, 'goods'), 2);
  assert.equal(locationFit(near, accra, at('NG', 'Lagos', null, { GH: { ships: true, days: 5, answeredAt: NOW } }), 'goods'), 1);
  assert.equal(locationFit(near, accra, abuja, 'goods'), 0);
});

test('no location never ranks as nearby and never excludes', () => {
  assert.equal(locationFit({ scope: 'near' }, yaba, null, 'goods'), 0);
  assert.equal(locationFit({ scope: 'anywhere' }, yaba, null, 'goods'), 1);
  assert.equal(locationFit(undefined, yaba, null, 'goods'), 1);
});

test('a country request compares with the country asked for', () => {
  assert.equal(locationFit({ scope: 'country', country: 'GH' }, yaba, accra, 'goods'), 2);
  assert.equal(locationFit({ scope: 'country', country: 'GH' }, yaba, abuja, 'goods'), 0);
});

test('remote work fits everyone the same', () => {
  assert.equal(locationFit({ scope: 'near' }, yaba, accra, 'remote'), 1);
  assert.equal(locationFit({ scope: 'near' }, yaba, ikeja, 'remote'), 1);
});

test('remote work is never gated by reach', () => {
  assert.equal(servesCountry(yaba, 'GH', 'remote'), 'yes');
});

test('reach answers whether a seller serves another country', () => {
  const ships = at('NG', null, null, { GH: { ships: true, days: 5, answeredAt: NOW }, TG: { ships: false, days: null, answeredAt: NOW } });
  assert.equal(servesCountry(ships, 'GH', 'goods'), 'yes');
  assert.equal(servesCountry(ships, 'TG', 'goods'), 'no');
  assert.equal(servesCountry(ships, 'BJ', 'goods'), 'unknown');
  assert.equal(servesCountry(ships, 'NG', 'goods'), 'yes');
  assert.equal(servesCountry(ships, null, 'goods'), 'yes');
});

test('a no is not asked again for 30 days', () => {
  const said = (answeredAt: number) => at('NG', null, null, { GH: { ships: false, days: null, answeredAt } });
  assert.equal(needsDeliveryQuestion(said(NOW - 29 * DAY), 'GH', NOW), false);
  assert.equal(needsDeliveryQuestion(said(NOW - 31 * DAY), 'GH', NOW), true);
  assert.equal(needsDeliveryQuestion(yaba, 'GH', NOW), true);
  assert.equal(needsDeliveryQuestion(yaba, 'NG', NOW), false);
});

test('only the country is public', () => {
  assert.deepEqual(publicLocation(yaba), { country: 'NG' });
  assert.deepEqual(publicLocation(null), { country: null });
});

test('a country that is not two letters is dropped and text is tidied', () => {
  assert.equal(normalizeLocation({ country: 'Nigeria' }).country, null);
  assert.deepEqual(normalizeLocation({ country: ' ng ', city: '  Lagos ', area: 'x'.repeat(100) }), { country: 'NG', city: 'Lagos', area: 'x'.repeat(80) });
});

test('old rows get a kind: offers without one are remote, goods requests are goods', () => {
  assert.equal(kindOf({}), 'remote');
  assert.equal(kindOf({ tradeType: 'goods' }), 'goods');
  assert.equal(kindOf({ tradeType: 'service' }), 'remote');
  assert.equal(kindOf({ deliveryKind: 'in_person', tradeType: 'goods' }), 'in_person');
});

test('a country is read from plain words, with the city before it', async () => {
  const { parsePlace } = await import('./rules.js');
  assert.deepEqual(parsePlace('Lagos, Nigeria'), { country: 'NG', city: 'Lagos' });
  assert.deepEqual(parsePlace('I am in Accra Ghana'), { country: 'GH', city: null });
  assert.deepEqual(parsePlace('KE'), { country: 'KE', city: null });
  assert.deepEqual(parsePlace('somewhere nice'), { country: null, city: null });
});

test('everyday words are never read as a country code', async () => {
  const { parsePlace } = await import('./rules.js');
  for (const word of ['no', 'me', 'eu', 'in', 'NO', 'none']) assert.equal(parsePlace(word).country, null, word);
});

test('names with hyphens, accents and common short forms are read', async () => {
  const { parsePlace } = await import('./rules.js');
  assert.equal(parsePlace('Guinea-Bissau').country, 'GW');
  assert.equal(parsePlace("Abidjan, Côte d'Ivoire").country, 'CI');
  assert.equal(parsePlace('Ivory Coast').country, 'CI');
  assert.equal(parsePlace('London, UK').country, 'GB');
  assert.equal(parsePlace('USA').country, 'US');
  assert.equal(parsePlace('Kinshasa, DR Congo').country, 'CD');
  assert.equal(parsePlace('Niamey, Niger').country, 'NE');
  assert.equal(parsePlace('Malabo, Equatorial Guinea').country, 'GQ');
});

test('a place reads in either order, country first or city first', async () => {
  const { parsePlace } = await import('./rules.js');
  assert.deepEqual(parsePlace('Nigeria, Lagos'), { country: 'NG', city: 'Lagos' });
  assert.deepEqual(parsePlace('Lagos, Nigeria'), { country: 'NG', city: 'Lagos' });
  assert.deepEqual(parsePlace('Nigeria'), { country: 'NG', city: null });
});
