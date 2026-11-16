import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/core/api';
import { shortOfMoney } from './shortOfMoney';

test('a short balance is told apart from any other refusal', () => {
  assert.equal(shortOfMoney(new ApiError(409, 'Add 14.93 USDC to your balance first.', undefined, undefined, { needMicros: '14930000' })), true);
  assert.equal(shortOfMoney(new ApiError(400, 'insufficient balance')), true);
  assert.equal(shortOfMoney(new Error('Not enough USDC in your buying agent')), true);
  assert.equal(shortOfMoney(new ApiError(404, 'No contest with that id.')), false);
  assert.equal(shortOfMoney('insufficient balance'), false);
});
