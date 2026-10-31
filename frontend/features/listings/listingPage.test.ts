import assert from 'node:assert/strict';
import test from 'node:test';
import type { Listing } from '../../core/api';
import { marketShopCopy } from '../../shared/i18n/messages/marketShop';
import { countryName, howItWorks, howYouPay, whatYouGet } from './listingPage';

/// What the listing page says about an offer (view 44, Figma 02 and D2).
///
///   npx tsx --test features/listings/listingPage.test.ts

const t = marketShopCopy.en;
const base = { id: 'lst_1', title: 'Logo', description: 'A logo', askingPriceUsdc: 120 } as Listing;

test('what you get comes from the offer’s own parts, then its conditions', () => {
  const parts = { ...base, termsDraft: { conditions: ['2 rounds of changes'], proof: 'link', reviewWindowDays: 3, parts: [{ pct: 50, what: 'Your logo in 3 versions' }, { pct: 50, what: 'A one-page guide' }] } } as Listing;
  assert.deepEqual(whatYouGet(parts), ['Your logo in 3 versions', 'A one-page guide', '2 rounds of changes']);
  const conditionsOnly = { ...base, termsDraft: { conditions: ['Colours and fonts that match'], proof: 'link', reviewWindowDays: 3, parts: [{ pct: 100 }] } } as Listing;
  assert.deepEqual(whatYouGet(conditionsOnly), ['Colours and fonts that match']);
  assert.deepEqual(whatYouGet(base), []);
});

test('how you pay says one payment or the number of parts', () => {
  assert.equal(howYouPay(base, t), 'One payment');
  const two = { ...base, termsDraft: { conditions: [], proof: 'link', reviewWindowDays: 3, parts: [{ pct: 50 }, { pct: 50 }] } } as Listing;
  assert.equal(howYouPay(two, t), 'In 2 parts');
});

test('how it works names the seller and follows the kind of offer', () => {
  assert.deepEqual(howItWorks('Ada', 'remote', t), [
    'You order and pay in. Karwan holds the money.',
    'Ada does the work and sends it to you.',
    'You check it, then release the money to Ada.',
  ]);
  assert.equal(howItWorks('Tunde', 'goods', t)[1], 'Tunde sends it to you.');
  assert.equal(howItWorks('Musa', 'in_person', t)[1], 'Musa meets you to hand it over.');
});

test('a country is shown by its name, never a code or a city', () => {
  assert.equal(countryName('NG', 'en'), 'Nigeria');
  assert.equal(countryName(null, 'en'), null);
  assert.equal(countryName('ZZZ', 'en'), null);
});
