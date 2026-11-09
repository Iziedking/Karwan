import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoundPerson } from '@/core/api';
import { findPeopleCopy } from '@/shared/i18n/messages/findPeople';
import { distanceText, endsText, findIdOf, meetText, personLine, rankText, ratingText, titleOf } from './foundModel';

/// How the people an agent found read (view 72).

const t = findPeopleCopy.en;
const person = (over: Partial<FoundPerson> = {}): FoundPerson => ({
  tag: 'ngozi', name: 'Ngozi Okafor', verified: true, tier: 'ESTABLISHED', rating: '4.8 from 12 deals', stars: 4.8, ratings: 12,
  distance: { key: 'about', km: 3 }, meet: { atMyPlace: true, comeToYouKm: null, online: false }, priceUsdc: '60', days: 5,
  reasons: ['best_fit', 'nearby', 'verified'], recommended: true, photo: null, ...over,
});

test('only a find link with a real id is drawn as a card', () => {
  assert.equal(findIdOf('/find/6F1C2A3B-0000-4000-8000-000000000001'), '6f1c2a3b-0000-4000-8000-000000000001');
  assert.equal(findIdOf('/find/../admin'), null);
  assert.equal(findIdOf('/deals/abc'), null);
});

test('a row reads rating then rounded distance, never more', () => {
  assert.equal(personLine(person(), t), '4.8 from 12 deals · 3 km');
  assert.equal(personLine(person({ stars: null, ratings: 2, distance: { key: 'sameCity', city: 'Abuja' } }), t), 'New on Karwan · In Abuja');
  assert.equal(personLine(person({ distance: { key: 'unknown' } }), t), '4.8 from 12 deals');
  assert.equal(distanceText({ key: 'nearby' }, t), 'Nearby');
  assert.equal(ratingText({ stars: 5, ratings: 3 }, t), '5.0 from 3 deals');
});

test('ranks, how they work and the title', () => {
  assert.equal(rankText(0, t), 'Best match');
  assert.equal(rankText(1, t), '2nd');
  assert.equal(rankText(9, t), '5th');
  assert.equal(meetText({ atMyPlace: true, comeToYouKm: 10, online: true }, t), 'At their place, Comes to you, Online');
  assert.equal(titleOf({ kind: 'in_person', rows: [person(), person()] }, t), '2 people near you');
  assert.equal(titleOf({ kind: 'remote', rows: [person()] }, t), 'One person found');
});

test('an ended find says so', () => {
  assert.equal(endsText({ status: 'ended', endsAt: 0 }, t, 'en'), 'Ended');
  assert.match(endsText({ status: 'shortlisted', endsAt: Date.UTC(2026, 10, 14, 12) }, t, 'en'), /^Ends Saturday/);
});

test('every language carries every line', () => {
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k]));
  const en = keys(findPeopleCopy.en).sort();
  for (const [locale, copy] of Object.entries(findPeopleCopy)) {
    assert.deepEqual(keys(copy).sort(), en, locale);
    assert.equal(JSON.stringify(copy).includes('—'), false, `${locale} has an em dash`);
  }
});
