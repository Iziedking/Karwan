import assert from 'node:assert/strict';
import test from 'node:test';
import { dealHeadline } from './dealHeadline';

test('the headline is the brief, without the composed terms', () => {
  assert.equal(
    dealHeadline('I need a full stack developer with intensed backend and frontend development Delivery: by 16 Oct. Payment: 100 USDC held in escrow, released in 2 milestones: • Milestone 1, 50% (50 USDC): Improve m'),
    'I need a full stack developer with intensed backend and frontend development',
  );
});

test('a brief with sentences keeps its first one, and empty terms stay empty', () => {
  assert.equal(dealHeadline('Logo for my bakery. Two colours, SVG and PNG.\nPayment: 120 USDC'), 'Logo for my bakery.');
  assert.equal(dealHeadline(''), '');
  assert.equal(dealHeadline(undefined), '');
});

test('terms with no brief have no headline, so the row falls back to who it is with', () => {
  assert.equal(dealHeadline('Delivery: by 19 Oct. Payment: 150 USDC on delivery.'), '');
  assert.equal(dealHeadline('Payment: 50% now, 50% on delivery.'), '');
});
