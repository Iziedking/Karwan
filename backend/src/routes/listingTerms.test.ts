import assert from 'node:assert/strict';
import test from 'node:test';
import { termsDraftSchema } from './listings.js';

const draft = {
  conditions: ['2 rounds of changes included'],
  proof: 'link' as const,
  parts: [
    { pct: 30, what: 'First draft of the logo in two styles' },
    { pct: 70, what: 'Final logo in SVG and PNG' },
  ],
  reviewWindowDays: 3,
};

test('offer terms accept two to five milestones that each say what they deliver and add up to 100', () => {
  assert.equal(termsDraftSchema.safeParse(draft).success, true);
  assert.equal(
    termsDraftSchema.safeParse({ ...draft, parts: [{ pct: 20, what: 'Sketches' }, { pct: 30, what: 'Two directions' }, { pct: 50, what: 'Final files' }] }).success,
    true,
  );
});

test('offer terms refuse a silent milestone, a split the escrow cannot fund and proof that is not built', () => {
  assert.equal(termsDraftSchema.safeParse({ ...draft, parts: [{ pct: 30, what: ' ' }, { pct: 70, what: 'Final files' }] }).success, false);
  assert.equal(termsDraftSchema.safeParse({ ...draft, parts: [{ pct: 60, what: 'A' }, { pct: 30, what: 'B' }] }).success, false);
  assert.equal(termsDraftSchema.safeParse({ ...draft, parts: [{ pct: 100, what: 'All of it' }] }).success, false);
  assert.equal(termsDraftSchema.safeParse({ ...draft, proof: 'tracking' }).success, false);
  assert.equal(termsDraftSchema.safeParse({ ...draft, reviewWindowDays: 120 }).success, false);
});
