import assert from 'node:assert/strict';
import test from 'node:test';
import { guessCountry } from './guessCountry';

/// The country setup starts from when the account has none (view 39, 19 Nov):
/// the phone's time zone, then its language region, then Nigeria.
///
///   npx tsx --test shared/places/guessCountry.test.ts

test('the time zone comes first', () => {
  assert.equal(guessCountry('Africa/Lagos', ['en-GB']), 'NG');
  assert.equal(guessCountry('Africa/Accra', ['en']), 'GH');
  assert.equal(guessCountry('Africa/Nairobi', []), 'KE');
});

test('then the language region', () => {
  assert.equal(guessCountry(undefined, ['fr-CI', 'fr']), 'CI');
  assert.equal(guessCountry('Mars/Base', ['en-GH']), 'GH');
});

test('then Nigeria', () => {
  assert.equal(guessCountry(undefined, ['en']), 'NG');
  assert.equal(guessCountry('', []), 'NG');
});
