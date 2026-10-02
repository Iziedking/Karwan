import assert from 'node:assert/strict';
import test from 'node:test';
import { composeTerms, evenSplit, termsIssues, type TermsCopy, type TermsDraft } from './composeTerms';

const copy: TermsCopy = {
  due: 'Delivery: by {date}.',
  conditions: 'Accepted when:',
  proofLink: 'Proof of delivery: a link to the work.',
  proofTracking: 'Proof of delivery: carrier and tracking number.',
  proofEither: 'Proof of delivery: a link or a tracking number.',
  payment: 'Payment: {amount} USDC held in escrow, released in {n} parts:',
  paymentNoPrice: 'Payment: held in escrow, released in {n} parts:',
  part: '• {name}, {pct}% ({amount} USDC): {what}',
  partNoPrice: '• {name}, {pct}%: {what}',
  partName: 'Part {n}',
  review: 'Check window: {n} days after each delivery. No reply in that time releases that part.',
  reviewOne: 'Check window: 1 day after each delivery. No reply in that time releases that part.',
  late: 'Late: if nothing is delivered by the deadline, unpaid parts return to the buyer.',
};

const draft: TermsDraft = {
  conditions: ['2 rounds of changes included', '  '],
  proof: 'link',
  parts: [
    { pct: 20, what: 'Three logo sketches' },
    { pct: 40, what: ' Logo in SVG and PNG ' },
    { pct: 40, what: 'Packaging labels for 3 products' },
  ],
  reviewWindowDays: 3,
};

test('the agreement lists each milestone with what it delivers, in a fixed order', () => {
  assert.equal(
    composeTerms(draft, { priceUsdc: 450, dueLabel: '14 Oct' }, copy),
    [
      'Delivery: by 14 Oct.',
      'Payment: 450 USDC held in escrow, released in 3 parts:',
      '• Part 1, 20% (90 USDC): Three logo sketches',
      '• Part 2, 40% (180 USDC): Logo in SVG and PNG',
      '• Part 3, 40% (180 USDC): Packaging labels for 3 products',
      'Accepted when:',
      '• 2 rounds of changes included',
      'Proof of delivery: a link to the work.',
      'Check window: 3 days after each delivery. No reply in that time releases that part.',
      'Late: if nothing is delivered by the deadline, unpaid parts return to the buyer.',
    ].join('\n'),
  );
});

test('with no deadline there is no lateness promise, and no price shows no amounts', () => {
  const text = composeTerms({ ...draft, reviewWindowDays: 1 }, { priceUsdc: null, dueLabel: null }, copy);
  assert.ok(!text.includes('Late:'));
  assert.ok(!text.includes('Delivery: by'));
  assert.ok(text.includes('• Part 1, 20%: Three logo sketches'));
  assert.ok(text.includes('Check window: 1 day after'));
});

test('readiness names every milestone that does not say what it delivers', () => {
  assert.deepEqual(termsIssues(draft), []);
  assert.deepEqual(
    termsIssues({ ...draft, parts: [{ pct: 60, what: '' }, { pct: 30, what: 'Final files in SVG' }] }),
    [{ code: 'no-what', part: 1 }, { code: 'split', total: 90 }],
  );
  assert.deepEqual(termsIssues({ ...draft, parts: [{ pct: 50, what: 'Logo' }, { pct: 50, what: 'Final files in SVG' }] }), [{ code: 'vague', item: 'Logo' }]);
});

test('an even split adds up to 100 for every allowed count', () => {
  for (const count of [2, 3, 4, 5]) {
    const shares = evenSplit(count);
    assert.equal(shares.length, count);
    assert.equal(shares.reduce((sum, pct) => sum + pct, 0), 100);
  }
  assert.deepEqual(evenSplit(3), [33, 33, 34]);
});
