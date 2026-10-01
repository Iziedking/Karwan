import assert from 'node:assert/strict';
import test from 'node:test';
import { composeTerms, termsIssues, type TermsCopy, type TermsDraft } from './composeTerms';

const copy: TermsCopy = {
  due: 'Delivery: by {date}.',
  items: 'What is delivered:',
  conditions: 'Accepted when:',
  proofLink: 'Proof of delivery: a link to the work.',
  proofTracking: 'Proof of delivery: carrier and tracking number.',
  proofEither: 'Proof of delivery: a link or a tracking number.',
  payment: 'Payment: {amount} USDC held in escrow, released in {n} parts:',
  paymentNoPrice: 'Payment: held in escrow, released in {n} parts:',
  part: '• {name}, {pct}% ({amount} USDC), for {covers}.',
  partNoPrice: '• {name}, {pct}%, for {covers}.',
  partName: 'Part {n}',
  coversStart: 'starting the work',
  coversAll: 'everything listed',
  review: 'Check window: {n} days after each delivery. No reply in that time releases that part.',
  reviewOne: 'Check window: 1 day after each delivery. No reply in that time releases that part.',
  late: 'Late: if nothing is delivered by the deadline, unpaid parts return to the buyer.',
};

const draft: TermsDraft = {
  items: ['Logo in SVG and PNG', '  ', 'Packaging label for 3 products'],
  conditions: ['2 rounds of changes included'],
  proof: 'link',
  parts: [
    { pct: 20, covers: { kind: 'start' } },
    { pct: 40, covers: { kind: 'item', item: 'Logo in SVG and PNG' } },
    { pct: 40, covers: { kind: 'all' } },
  ],
  reviewWindowDays: 3,
};

test('the agreement lists every part in a fixed order, skipping blank lines', () => {
  assert.equal(
    composeTerms(draft, { priceUsdc: 450, dueLabel: '14 Oct' }, copy),
    [
      'Delivery: by 14 Oct.',
      'What is delivered:',
      '• Logo in SVG and PNG',
      '• Packaging label for 3 products',
      'Accepted when:',
      '• 2 rounds of changes included',
      'Proof of delivery: a link to the work.',
      'Payment: 450 USDC held in escrow, released in 3 parts:',
      '• Part 1, 20% (90 USDC), for starting the work.',
      '• Part 2, 40% (180 USDC), for Logo in SVG and PNG.',
      '• Part 3, 40% (180 USDC), for everything listed.',
      'Check window: 3 days after each delivery. No reply in that time releases that part.',
      'Late: if nothing is delivered by the deadline, unpaid parts return to the buyer.',
    ].join('\n'),
  );
});

test('with no deadline there is no lateness promise, and no price shows no amounts', () => {
  const text = composeTerms({ ...draft, reviewWindowDays: 1 }, { priceUsdc: null, dueLabel: null }, copy);
  assert.ok(!text.includes('Late:'));
  assert.ok(!text.includes('Delivery: by'));
  assert.ok(text.includes('• Part 1, 20%, for starting the work.'));
  assert.ok(text.includes('Check window: 1 day after'));
});

test('readiness names what an arbiter could not decide', () => {
  assert.deepEqual(termsIssues(draft), []);
  assert.deepEqual(
    termsIssues({ ...draft, items: [' '], conditions: [], parts: [{ pct: 60, covers: { kind: 'all' } }] }).map((issue) => issue.code),
    ['no-items', 'split'],
  );
  assert.deepEqual(termsIssues({ ...draft, items: ['Logo'] }), [{ code: 'vague', item: 'Logo' }]);
});
