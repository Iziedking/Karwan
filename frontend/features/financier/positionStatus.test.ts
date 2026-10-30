import assert from 'node:assert/strict';
import test from 'node:test';
import { positionStatus } from './positionStatus';

test('every offer state reads as itself on the position page', () => {
  assert.equal(positionStatus('awaiting_financier'), 'paySeller');
  assert.equal(positionStatus('accepted'), 'active');
  assert.equal(positionStatus('settled'), 'repaid');
  assert.equal(positionStatus('repaid'), 'repaid');
  assert.equal(positionStatus('waived'), 'closed');
  assert.equal(positionStatus('defaulted'), 'review');
  assert.equal(positionStatus('expired'), 'expired');
  assert.equal(positionStatus('rejected'), 'declined');
  assert.equal(positionStatus('superseded'), 'declined');
  assert.equal(positionStatus('offered'), 'pending');
});
