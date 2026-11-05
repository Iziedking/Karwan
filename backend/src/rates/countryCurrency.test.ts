import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currencyForCountry } from './countryCurrency.js';
import { newAccountProfile } from '../profile/signup.js';

///   npx tsx --test src/rates/countryCurrency.test.ts

test('your country picks the currency amounts read in, USDC where it is not shown yet', () => {
  assert.equal(currencyForCountry('NG'), 'NGN');
  assert.equal(currencyForCountry('ng'), 'NGN');
  assert.equal(currencyForCountry('DE'), 'EUR');
  assert.equal(currencyForCountry('SN'), 'XOF');
  assert.equal(currencyForCountry('KE'), 'KES');
  assert.equal(currencyForCountry('GH'), 'USDC');
  assert.equal(currencyForCountry(null), 'USDC');
});

test('a new account keeps its country and reads in that currency', () => {
  const ng = newAccountProfile('0xABC', 'ada', 'person', 'NG');
  assert.equal(ng.location?.country, 'NG');
  assert.equal(ng.settings?.displayCurrency, 'NGN');
  const gh = newAccountProfile('0xabc', 'kofi', 'person', 'GH');
  assert.equal(gh.location?.country, 'GH');
  assert.equal(gh.settings?.displayCurrency, undefined);
  const none = newAccountProfile('0xabc', 'x', 'person');
  assert.equal(none.location, undefined);
  assert.equal(none.settings, undefined);
});
