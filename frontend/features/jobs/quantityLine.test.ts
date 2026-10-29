import assert from 'node:assert/strict';
import test from 'node:test';
import { quantityLine } from './quantityLine';
import { requestPageCopy } from '@/shared/i18n/messages/requestPage';

const copy = requestPageCopy.en;

test('a request with a count says what each item comes to', () => {
  assert.equal(quantityLine(copy, { count: 3, unit: 'pairs' }, '100'), '3 pairs, 100 USDC for all, about 33 USDC each');
  assert.equal(quantityLine(copy, { count: 4, unit: null }, 10), '4 items, 10 USDC for all, about 2.5 USDC each');
  assert.equal(quantityLine(copy, { count: 200, unit: 't-shirts' }, '1500'), '200 t-shirts, 1,500 USDC for all, about 7.5 USDC each');
});

test('no count, one item or no budget means no line', () => {
  assert.equal(quantityLine(copy, null, '100'), null);
  assert.equal(quantityLine(copy, { count: 1, unit: 'pair' }, '100'), null);
  assert.equal(quantityLine(copy, { count: 3, unit: 'pairs' }, '0'), null);
});
