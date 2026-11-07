import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localExample, roundExample } from './setupMoney';

/// Setup asks prices in the currency the person reads (owner, 7 Nov 2026).

test('examples are round figures', () => {
  assert.equal(roundExample(29_431), 30_000);
  assert.equal(roundExample(58_862), 60_000);
  assert.equal(roundExample(147_155), 150_000);
  assert.equal(roundExample(18.4), 20);
  assert.equal(roundExample(3.2), 3);
});

test('a price example reads in naira for someone in Nigeria, both ends of a range', () => {
  const said = localExample('20 to 40 USDC, 3 days', 'NGN', 1471.5, 'en');
  assert.equal(said, '₦30,000 to ₦60,000, 3 days');
  assert.equal(localExample('Phone repairs, up to 50 USDC', 'NGN', 1471.5, 'en'), 'Phone repairs, up to ₦75,000');
  assert.equal(localExample('USDC 20 hadi 40, siku 3', 'NGN', 1471.5, 'en'), '₦30,000 hadi ₦60,000, siku 3');
  assert.doesNotMatch(localExample('I could not read a price there. Try something like 20 to 40 USDC, 3 days.', 'KES', 129.2, 'en'), /USDC/);
});

test('USDC, or no fresh rate, keeps the example as written', () => {
  assert.equal(localExample('20 to 40 USDC, 3 days', 'USDC', null, 'en'), '20 to 40 USDC, 3 days');
  assert.equal(localExample('20 to 40 USDC, 3 days', 'NGN', null, 'en'), '20 to 40 USDC, 3 days');
});

test('the setup screen says its examples and read-back in the person\'s currency', () => {
  const flow = readFileSync(new URL('./SetupFlow.tsx', import.meta.url), 'utf8');
  assert.match(flow, /examples=\{t\.questions\.price\.examples\.map\(ex\)\}/);
  assert.match(flow, /said\(readBack\.lines\)/);
  assert.match(flow, /<SummaryLines lines=\{said\(state\.lines\)\}/);
});
