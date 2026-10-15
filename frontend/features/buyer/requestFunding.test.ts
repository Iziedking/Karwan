import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { requestFunding } from './requestFunding';

const quote = {
  requiredUsdc: '304.25',
  balanceUsdc: '250.34',
  topUpNeededUsdc: '53.91',
  activated: true,
  priceUsdc: '300',
  buyerFeeUsdc: '3.75',
  reserveUsdc: '0.5',
};

test('the review shows the balance, the most the agent can spend, and what that is made of', () => {
  const f = requestFunding(quote)!;
  assert.equal(f.balance, 250.34);
  assert.equal(f.canSpend, 304.25);
  assert.deepEqual(f.parts, { price: 300, fee: 3.75, reserve: 0.5 });
  assert.equal(f.topUp, 53.91);
  assert.equal(f.enough, false);
});

test('a funded agent is enough, and an older server without the parts still gives the totals', () => {
  const f = requestFunding({ requiredUsdc: '10.6', balanceUsdc: '20', topUpNeededUsdc: '0', activated: true })!;
  assert.equal(f.enough, true);
  assert.equal(f.parts, null);
  assert.equal(requestFunding(undefined), null);
  assert.equal(requestFunding({ ...quote, requiredUsdc: 'x' }), null);
});

test('the request is posted only once the agent can cover the most it may spend', () => {
  const form = readFileSync(new URL('./components/PostJobForm.tsx', import.meta.url), 'utf8');
  assert.match(form, /api\.fundingQuote\(authorisedPrice\(/, 'quoted at the price limit, not the budget');
  assert.match(form, /funding\?\.enough === false/);
  assert.match(form, /<FundAgentButton amountUsdc=\{funding\.topUp\}/);
  assert.doesNotMatch(form, /intentWarning\.bodyButtonRef/, 'the warning names the button on screen');
  const en = readFileSync(new URL('../../shared/i18n/messages/en.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(en, /bodyButtonRef/);
});
