import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { marketShopCopy } from '@/shared/i18n/messages/marketShop';
import { regionFromCookie, regionFromHeader } from '@/shared/utils/region';
import { aboutUsdFigure, visitorCurrency } from './visitorCurrency';

/// A visitor who is not signed in reads prices in the money of the place
/// they are in, with the dollar figure small beside it (view 74).
///
///   npx tsx --test features/money/visitorCurrency.test.ts

test('the region header gives a country, and nothing else does', () => {
  assert.equal(regionFromHeader('NG'), 'NG');
  assert.equal(regionFromHeader('ke'), 'KE');
  for (const none of ['XX', 'T1', '', 'NGA', 'N', null, undefined]) assert.equal(regionFromHeader(none), null);
});

test('the region is read back from the cookie the page was given', () => {
  assert.equal(regionFromCookie('karwan-locale=fr; karwan-region=SN; other=1'), 'SN');
  assert.equal(regionFromCookie('karwan-region=NG'), 'NG');
  assert.equal(regionFromCookie('karwan-region=XX'), null);
  assert.equal(regionFromCookie('not-karwan-region=NG'), null);
  assert.equal(regionFromCookie(''), null);
});

test('a visitor reads the money of their region, then of their language, then dollars', () => {
  assert.equal(visitorCurrency('karwan-region=NG', ['en-US']), 'NGN');
  assert.equal(visitorCurrency('', ['en-KE', 'en']), 'KES');
  assert.equal(visitorCurrency('karwan-region=FR', []), 'EUR');
  assert.equal(visitorCurrency('karwan-region=GH', []), 'USD');
  assert.equal(visitorCurrency('', ['en']), 'USD');
});

test('the dollar figure sits beside a local price for a visitor only', () => {
  assert.equal(aboutUsdFigure(15, 'NGN', true), '15');
  assert.equal(aboutUsdFigure(1250.5, 'KES', true), '1,250.5');
  assert.equal(aboutUsdFigure(15, 'USD', true), null);
  assert.equal(aboutUsdFigure(15, 'USDC', true), null);
  assert.equal(aboutUsdFigure(15, 'NGN', false), null);
});

test('the words beside the price name dollars, in five languages', () => {
  for (const [locale, copy] of Object.entries(marketShopCopy)) {
    assert.match(copy.aboutUsd, /\{amount\}/, locale);
    assert.match(copy.aboutUsd, /USD/, locale);
    assert.doesNotMatch(copy.aboutUsd, /USDC|—/, locale);
  }
});

test('the page hands the visitor their region, and prices read it', () => {
  const middleware = readFileSync('middleware.ts', 'utf8');
  assert.match(middleware, /regionFromHeader\(req\.headers\.get\('cf-ipcountry'\)\)/);
  assert.match(middleware, /REGION_COOKIE/);
  const hook = readFileSync('features/money/hooks/useDisplayCurrency.ts', 'utf8');
  assert.match(hook, /visitorCurrency\(/);
  const price = readFileSync('features/money/components/Price.tsx', 'utf8');
  assert.match(price, /aboutUsdFigure\(/);
});
