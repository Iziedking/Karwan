import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseErrorKey } from './chooseError';

test('each refusal names its reason instead of one "try again"', () => {
  assert.equal(chooseErrorKey(409, 'INSUFFICIENT_AGENT_BALANCE'), 'noFunds');
  assert.equal(chooseErrorKey(409, 'CLOSED'), 'closed');
  assert.equal(chooseErrorKey(409, 'ALREADY_FUNDED'), 'taken');
  assert.equal(chooseErrorKey(409, 'ALREADY_APPROVED'), 'taken');
  assert.equal(chooseErrorKey(404, 'NO_OFFER'), 'gone');
  assert.equal(chooseErrorKey(403, 'forbidden'), 'notYours');
  assert.equal(chooseErrorKey(409, undefined), 'busy');
  assert.equal(chooseErrorKey(502, 'BID_FAILED'), 'failed');
  assert.equal(chooseErrorKey(0, undefined), 'failed');
});
