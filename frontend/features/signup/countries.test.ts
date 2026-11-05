import assert from 'node:assert/strict';
import test from 'node:test';
import { browserCountry, countryOptions, currencyForCountry } from './countries';

///   npx tsx --test features/signup/countries.test.ts

test('every country is named in the person’s language, A to Z', () => {
  const en = countryOptions('en');
  assert.ok(en.length > 190);
  assert.equal(en.find((c) => c.code === 'NG')?.name, 'Nigeria');
  const names = en.map((c) => c.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));
  assert.equal(countryOptions('fr').find((c) => c.code === 'DE')?.name, 'Allemagne');
});

test('the browser’s region picks the country first', () => {
  assert.equal(browserCountry(['en-NG', 'en']), 'NG');
  assert.equal(browserCountry(['fr', 'fr-SN']), 'SN');
  assert.equal(browserCountry(['en']), null);
});

test('the same country map as the server', () => {
  assert.equal(currencyForCountry('NG'), 'NGN');
  assert.equal(currencyForCountry('FR'), 'EUR');
  assert.equal(currencyForCountry('TG'), 'XOF');
  assert.equal(currencyForCountry('GH'), 'USDC');
});
