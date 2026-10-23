import assert from 'node:assert/strict';
import test from 'node:test';
import { dealBody, dealCardFields, deadlineFromDate } from './dealDraft.js';

/// The assistant builds the deal (view 24).
///
///   npx tsx --test src/assistant/dealDraft.test.ts

const BUYER = '0x00000000000000000000000000000000000000b1';
const SELLER = { sellerAddress: '0x00000000000000000000000000000000000000a1' };
const NOW = Date.parse('2026-10-23T12:00:00Z');

test('the fewest answers make a one-payment deal with the form defaults', () => {
  const out = dealBody(BUYER, SELLER, { what: 'A logo', amountUsdc: 50, deliverInDays: 5 }, NOW);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.body.firstReleasePct, 100);
  assert.equal(out.body.milestonePcts, undefined);
  assert.equal(out.body.acceptanceWindowHours, 24);
  assert.equal(out.body.deadlineDays, 5);
  assert.equal(out.body.requireStake, false);
  assert.equal(out.body.verificationPolicy, 'standard');
});

test('a date becomes days and hours on the server, never in the model', () => {
  assert.deepEqual(deadlineFromDate('2026-10-25', NOW), { days: 2, hours: 11 });
  assert.match((deadlineFromDate('2026-10-01', NOW) as { error: string }).error, /passed/);
  assert.match((deadlineFromDate('25/10/2026', NOW) as { error: string }).error, /could not be read/);
});

test('parts, review days, stake and goods terms all reach the body', () => {
  const out = dealBody(
    BUYER,
    SELLER,
    {
      what: '200 bags of rice',
      amountUsdc: 900,
      deliverInDays: 14,
      payments: [30, 70],
      reviewDays: 3,
      stakePct: 50,
      tradeType: 'goods',
      incoterms: 'FOB',
      paymentTerms: 'net30',
      company: { name: 'Ada Foods Ltd' },
    },
    NOW,
  );
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.deepEqual(out.body.milestonePcts, [30, 70]);
  assert.equal(out.body.firstReleasePct, 30);
  assert.equal(out.body.reviewWindowDays, 3);
  assert.equal(out.body.requireStake, true);
  assert.equal(out.body.requireStakePct, 50);
  assert.equal(out.body.incoterms, 'FOB');
  assert.equal(out.body.counterpartyCompany?.name, 'Ada Foods Ltd');
});

test('goods terms are dropped from a service deal', () => {
  const out = dealBody(BUYER, SELLER, { what: 'Copywriting', amountUsdc: 80, incoterms: 'FOB', tradeType: 'service' }, NOW);
  assert.equal(out.ok && out.body.incoterms, undefined);
});

test('whatever the route would refuse, the draft refuses in plain words', () => {
  const parts = dealBody(BUYER, SELLER, { what: 'A logo', amountUsdc: 50, payments: [40, 40] }, NOW);
  assert.deepEqual(parts, { ok: false, message: 'The payment parts must be whole percents that add up to 100, at most five parts.' });
  const stake = dealBody(BUYER, SELLER, { what: 'A logo', amountUsdc: 50, stakePct: 33 }, NOW);
  assert.equal(stake.ok, false);
  const empty = dealBody(BUYER, SELLER, { what: '  ', amountUsdc: 50 }, NOW);
  assert.equal(empty.ok, false);
});

test('the card lists every term that will be sent', () => {
  const out = dealBody(BUYER, SELLER, { what: 'A logo', amountUsdc: 50, deliverInDays: 5, payments: [50, 50], evidenceRequired: true }, NOW);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  const rows = Object.fromEntries(dealCardFields(out.body, 'Ada Obi · @ada', '50.25').map((r) => [r.label, r.value]));
  assert.equal(rows.With, 'Ada Obi · @ada');
  assert.equal(rows['You pay into escrow'], '50.25 USDC with the fee, after they accept');
  assert.equal(rows['Deliver within'], '5 days');
  assert.equal(rows.Payment, '2 parts: 50%, 50%');
  assert.equal(rows['Delivery proof'], 'Required');
});
