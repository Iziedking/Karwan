import assert from 'node:assert/strict';
import test from 'node:test';
import { dealFigure } from './dealFigure';

const ADA = '0x2222222222222222222222222222222222222222';
const agreed = { currency: 'NGN', amount: '100000' };
const worth = { [ADA]: { currency: 'KES', amount: '9650' } };

test('the price as agreed reads as agreed for anyone in that currency', () => {
  assert.deepEqual(dealFigure({ agreedLocal: agreed, settledAt: 1, settledWorth: worth }, ADA, 'NGN'), agreed);
});

test('a finished deal reads what it was worth to the other side that day (view 77)', () => {
  assert.deepEqual(dealFigure({ agreedLocal: agreed, settledAt: 1, settledWorth: worth }, ADA.toUpperCase().replace('0X', '0x'), 'KES'), worth[ADA]);
});

test('a deal still running, another reader, or another currency reads at the rate of the day', () => {
  assert.deepEqual(dealFigure({ agreedLocal: agreed, settledWorth: worth }, ADA, 'KES'), agreed, 'not settled yet');
  assert.deepEqual(dealFigure({ agreedLocal: agreed, settledAt: 1, settledWorth: worth }, null, 'KES'), agreed);
  assert.deepEqual(dealFigure({ agreedLocal: agreed, settledAt: 1, settledWorth: worth }, ADA, 'EUR'), agreed, 'they changed currency since');
  assert.equal(dealFigure({ settledAt: 1 }, ADA, 'KES'), undefined);
});
