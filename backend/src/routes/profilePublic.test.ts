import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../db/profiles.js';
import { publicView } from './profile.js';

/// What a non-owner reads about a person: their country, never their city,
/// area, delivery reach or business region.
///
///   npx tsx --test src/routes/profilePublic.test.ts

const ada = {
  address: '0xada',
  role: 'seller',
  displayName: 'Ada',
  createdAt: 1,
  updatedAt: 1,
  location: { country: 'NG', city: 'Lagos', area: 'Yaba', reach: { GH: { ships: true, days: 5, answeredAt: 1 } } },
  smeProfile: { sector: 'fashion', region: 'Yaba, Lagos', primaryMarkets: 'Accra', taxIdEncrypted: 'x' },
} as unknown as UserProfile;

test('a non-owner never receives city, area or reach', () => {
  const text = JSON.stringify(publicView(ada));
  for (const secret of ['"city"', '"area"', '"reach"', '"region"', '"primaryMarkets"', 'Yaba', 'Accra', 'taxIdEncrypted']) {
    assert.equal(text.includes(secret), false, `leaked ${secret}`);
  }
});

test('a non-owner sees the country', () => {
  assert.equal(publicView(ada).country, 'NG');
});

test('someone with no location shows no country', () => {
  assert.equal(publicView({ ...ada, location: undefined } as UserProfile).country, null);
});
