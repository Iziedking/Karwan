import assert from 'node:assert/strict';
import test from 'node:test';
import { termsDraftSchema } from './listings.js';

const draft = {
  items: ['Logo in SVG and PNG'],
  conditions: ['2 rounds of changes included'],
  proof: 'link' as const,
  parts: [
    { pct: 30, covers: { kind: 'start' as const } },
    { pct: 70, covers: { kind: 'all' as const } },
  ],
  reviewWindowDays: 3,
};

test('offer terms accept any split of two to five parts that makes 100', () => {
  assert.equal(termsDraftSchema.safeParse(draft).success, true);
  assert.equal(
    termsDraftSchema.safeParse({ ...draft, parts: [{ pct: 20, covers: { kind: 'start' } }, { pct: 30, covers: { kind: 'item', item: 'Logo in SVG and PNG' } }, { pct: 50, covers: { kind: 'all' } }] }).success,
    true,
  );
});

test('offer terms refuse splits the escrow cannot fund and proof that is not built', () => {
  assert.equal(termsDraftSchema.safeParse({ ...draft, parts: [{ pct: 60, covers: { kind: 'all' } }, { pct: 30, covers: { kind: 'all' } }] }).success, false);
  assert.equal(termsDraftSchema.safeParse({ ...draft, parts: [{ pct: 100, covers: { kind: 'all' } }] }).success, false);
  assert.equal(termsDraftSchema.safeParse({ ...draft, proof: 'tracking' }).success, false);
  assert.equal(termsDraftSchema.safeParse({ ...draft, reviewWindowDays: 120 }).success, false);
});
