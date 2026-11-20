import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrivateLocation } from '../location/rules.js';
import { AT_MY_PLACE_KM, FIND_MAX, rankForFind, type FindCandidate, type FindNeed } from './rank.js';

/// The one ranking for finding people (view 72), used by the assistant,
/// Telegram and outside agents.

const WUSE = { lat: 9.07, lng: 7.479 };
const MAITAMA = { lat: 9.09, lng: 7.491 };
const GWARINPA = { lat: 9.11, lng: 7.4 };
const LAGOS = { lat: 6.507, lng: 3.375 };

const at = (city: string, area: string | null, point?: { lat: number; lng: number }, country = 'NG'): PrivateLocation => ({
  country, city, area, reach: {}, ...(point ? { point: { ...point, precision: 'area' as const, source: 'osm', at: 1 } } : {}),
});

const need = (over: Partial<FindNeed> = {}): FindNeed => ({
  text: 'tailor to make a dress', keywords: ['tailor', 'dress'], budgetUsdc: 70, kind: 'in_person', where: { scope: 'near' },
  buyer: '0xbuyer', buyerLocation: at('Abuja', 'Wuse 2', WUSE), buyerVerified: false, ...over,
});

const seller = (user: string, over: Partial<FindCandidate> = {}): FindCandidate => ({
  user, sellerAgent: `${user}-agent`, name: user, tag: user, words: ['tailor', 'dress', 'sewing'],
  meet: { atMyPlace: true, comeToYouKm: null, online: false }, location: at('Abuja', 'Maitama', MAITAMA),
  verified: false, tier: 'ESTABLISHED', rating: { kind: 'rated', value: 4.5, count: 6, disputed: 0 },
  price: { min: 40, usual: 60 }, days: { min: 2, max: 5 }, onTimeRate: null, completed: 3, disputesLost: 0, contactFrom: 'anyone', outsideAgents: true, ...over,
});

const users = (rows: { user: string }[]) => rows.map((r) => r.user);
const rank = (cands: FindCandidate[], n = need(), opts: Partial<Parameters<typeof rankForFind>[2]> = {}) =>
  rankForFind(cands, n, { requireVerified: false, blocked: new Set(), cleanRecordCounts: false, ...opts });

test('skill fit is required, and the better fit comes first', () => {
  const rows = rank([
    seller('cook', { words: ['catering', 'cooking'] }),
    seller('partial', { words: ['dress', 'shoes'] }),
    seller('tailor'),
  ]);
  assert.deepEqual(users(rows), ['tailor', 'partial']);
});

test('in person: a seller near the buyer is found, one in Lagos is not', () => {
  const rows = rank([seller('lagos', { location: at('Lagos', 'Yaba', LAGOS) }), seller('maitama')]);
  assert.deepEqual(users(rows), ['maitama']);
  assert.deepEqual(rows[0]!.distance, { key: 'about', km: 3 });
});

test('in person: at their place reaches 25 km; coming to you reaches what they set', () => {
  const far = at('Abuja', 'Kubwa', { lat: 9.07 + 0.3, lng: 7.479 });
  assert.ok(AT_MY_PLACE_KM === 25);
  assert.deepEqual(users(rank([seller('kubwa', { location: far })])), []);
  assert.deepEqual(users(rank([seller('kubwa', { location: far, meet: { atMyPlace: false, comeToYouKm: 40, online: false } })])), ['kubwa']);
  assert.deepEqual(users(rank([seller('kubwa', { location: far, meet: { atMyPlace: false, comeToYouKm: 10, online: false } })])), []);
});

test('in person with no map points: the same city by name still counts', () => {
  const n = need({ buyerLocation: at('Abuja', 'Wuse 2') });
  const rows = rank([seller('named', { location: at('abuja', 'Garki') }), seller('lagos', { location: at('Lagos', null) })], n);
  assert.deepEqual(users(rows), ['named']);
  assert.deepEqual(rows[0]!.distance, { key: 'sameCity', city: 'Abuja' }, 'the buyer city, never the seller area');
});

test('remote work needs online; goods need to reach the buyer country', () => {
  const remote = need({ kind: 'remote', where: { scope: 'anywhere' } });
  assert.deepEqual(users(rank([seller('shop'), seller('web', { meet: { atMyPlace: false, comeToYouKm: null, online: true }, location: at('Lagos', null, LAGOS) })], remote)), ['web']);
  const goods = need({ kind: 'goods', where: { scope: 'country', country: 'NG' } });
  const rows = rank([seller('ng', { location: at('Lagos', null, LAGOS) }), seller('gh', { location: at('Accra', null, undefined, 'GH') })], goods);
  assert.deepEqual(users(rows), ['ng']);
});

test('reputation orders an equal fit: verified, then tier, then rating', () => {
  const rows = rank([
    seller('rated', { rating: { kind: 'rated', value: 4.9, count: 20, disputed: 0 } }),
    seller('strong', { tier: 'STRONG' }),
    seller('verified', { verified: true, tier: 'COLD' }),
  ]);
  assert.deepEqual(users(rows), ['verified', 'strong', 'rated']);
});

test('distance orders an equal record', () => {
  const rows = rank([seller('gwarinpa', { location: at('Abuja', 'Gwarinpa', GWARINPA) }), seller('maitama')]);
  assert.deepEqual(users(rows), ['maitama', 'gwarinpa']);
});

test('no price comes up as asks for a quote; a lowest price over the budget does not come up', () => {
  const rows = rank([seller('quote', { price: null, days: null }), seller('dear', { price: { min: 90, usual: 120 } }), seller('fits')]);
  assert.deepEqual(users(rows).sort(), ['fits', 'quote']);
  assert.equal(rows.find((r) => r.user === 'quote')!.priceUsdc, null);
  assert.equal(rows.find((r) => r.user === 'fits')!.priceUsdc, '60');
});

test('the buyer, blocked people and sellers who take only verified buyers are skipped', () => {
  const rows = rank(
    [seller('0xbuyer'), seller('blocked'), seller('picky', { contactFrom: 'verified' }), seller('ok')],
    need(),
    { blocked: new Set(['blocked']) },
  );
  assert.deepEqual(users(rows), ['ok']);
  assert.deepEqual(users(rank([seller('picky', { contactFrom: 'verified' })], need({ buyerVerified: true }))), ['picky']);
});

test('when verification is required, only verified people come up', () => {
  assert.deepEqual(users(rank([seller('a'), seller('b', { verified: true })], need(), { requireVerified: true })), ['b']);
});

test('at most five rows, one recommended, with reasons and no point in them', () => {
  const many = Array.from({ length: 8 }, (_, i) => seller(`s${i}`, { verified: i === 3 }));
  const rows = rank(many);
  assert.equal(rows.length, FIND_MAX);
  assert.equal(rows.filter((r) => r.recommended).length, 1);
  assert.equal(rows[0]!.user, 's3');
  assert.ok(rows[0]!.recommended);
  assert.ok(rows[0]!.reasons.includes('verified'));
  assert.ok(rows[0]!.reasons.length <= 3);
  const text = JSON.stringify(rows);
  assert.equal(text.includes('7.491'), false);
  assert.equal(text.includes('Maitama'), false);
});

test('on testnet a clean record can be recommended when nobody is verified', () => {
  assert.equal(rank([seller('a')]).some((r) => r.recommended), false);
  assert.equal(rank([seller('a')], need(), { cleanRecordCounts: true })[0]!.recommended, true);
  assert.equal(rank([seller('a', { disputesLost: 1 })], need(), { cleanRecordCounts: true })[0]!.recommended, false);
});

test('the rating goes out as a number and a count, so each language words it', () => {
  const [rated] = rank([seller('a')]);
  assert.equal(rated!.stars, 4.5);
  assert.equal(rated!.ratings, 6);
  const [fresh] = rank([seller('b', { rating: { kind: 'new', count: 2 } })]);
  assert.equal(fresh!.stars, null);
  assert.equal(fresh!.ratings, 2);
});

test('the suit maker comes first for a suit (view 93)', () => {
  const logos = seller('logos', { rating: { kind: 'rated', value: 4.9, count: 20, disputed: 0, forWork: { value: 3.1, count: 0, rank: 3.1 } } });
  const suits = seller('suits', { rating: { kind: 'rated', value: 4.4, count: 9, disputed: 0, forWork: { value: 4.7, count: 3, rank: 4.7 } } });
  assert.deepEqual(users(rank([logos, suits])), ['suits', 'logos']);
});

test('a rating without forWork ranks on its overall value (view 93)', () => {
  const high = seller('high', { rating: { kind: 'rated', value: 4.9, count: 20, disputed: 0 } });
  const low = seller('low', { rating: { kind: 'rated', value: 4.4, count: 9, disputed: 0 } });
  assert.deepEqual(users(rank([low, high])), ['high', 'low']);
});

test('likeThis only for close deals (view 93)', () => {
  const rows = rank([
    seller('none', { rating: { kind: 'rated', value: 4.9, count: 20, disputed: 0, forWork: { value: 4.9, count: 0, rank: 4.9 } } }),
    seller('close', { rating: { kind: 'rated', value: 4.4, count: 9, disputed: 0, forWork: { value: 4.7, count: 3, rank: 4.7 } } }),
    seller('new', { rating: { kind: 'new', count: 1 } }),
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.user, r.likeThis]));
  assert.equal(by.none, null);
  assert.deepEqual(by.close, { stars: 4.7, count: 3 });
  assert.equal(by.new, null);
});


/// Matching by meaning (view 95 phase 2): a person who shares no word but is
/// close in meaning is kept, never ahead of a full word match.

test('a meaning-only person is kept, after a full word match even with a better record', () => {
  const rows = rank([
    seller('sews', { words: ['aso ebi', 'native wears'], meaning: 100, verified: true, tier: 'TRUSTED' }),
    seller('tailor'),
    seller('cook', { words: ['catering'], meaning: 0 }),
  ]);
  assert.deepEqual(users(rows), ['tailor', 'sews']);
});

test('a meaning-only fit counts at most 60, below a full word match', () => {
  const rows = rank([seller('sews', { words: ['aso ebi'], meaning: 100, verified: true, tier: 'TRUSTED' }), seller('tailor', { verified: false, tier: 'NEW' })]);
  assert.deepEqual(users(rows), ['tailor', 'sews']);
});

test('with no meaning given the ranking is the same as before', () => {
  const cands = [seller('cook', { words: ['catering'] }), seller('partial', { words: ['dress', 'shoes'] }), seller('tailor')];
  assert.deepEqual(rank(cands), rank(cands.map((c) => ({ ...c, meaning: 0 }))));
});
