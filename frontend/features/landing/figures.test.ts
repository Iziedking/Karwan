import assert from 'node:assert/strict';
import test from 'node:test';
import { figureParts, formatFigure } from './figures';

test('a figure splits into what comes before, the number and what comes after', () => {
  assert.deepEqual(figureParts('$2,400'), { prefix: '$', value: 2400, suffix: '', group: ',' });
  assert.deepEqual(figureParts('2 400 $'), { prefix: '', value: 2400, suffix: ' $', group: ' ' });
  assert.deepEqual(figureParts('$85'), { prefix: '$', value: 85, suffix: '', group: '' });
  assert.deepEqual(figureParts('4'), { prefix: '', value: 4, suffix: '', group: '' });
});

test('a figure with no number does not count', () => {
  assert.equal(figureParts('Early'), null);
  assert.equal(figureParts('مبكرًا'), null);
});

test('counting writes the number back in the same shape', () => {
  const dollars = figureParts('$2,400')!;
  assert.equal(formatFigure(dollars, 2400), '$2,400');
  assert.equal(formatFigure(dollars, 1200), '$1,200');
  assert.equal(formatFigure(dollars, 37), '$37');
  const french = figureParts('2 400 $')!;
  assert.equal(formatFigure(french, 1850), '1 850 $');
});
