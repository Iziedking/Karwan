import assert from 'node:assert/strict';
import test from 'node:test';
import { fundingRowState, isSettlingResponse } from './fundingPhase.js';

test('a landed transfer whose record is behind is never shown as failed', () => {
  assert.equal(fundingRowState('funding_landed_unrecorded'), 'settling');
});

test('not knowing is not the same as failing', () => {
  assert.equal(fundingRowState('funding_unconfirmed'), 'settling');
  assert.equal(fundingRowState('funding_in_flight'), 'settling');
});

test('only an actual failure reads as one', () => {
  assert.equal(fundingRowState('funding_failed'), 'error');
});

test('an unrecognised failure stays a failure', () => {
  assert.equal(fundingRowState(undefined), 'error');
  assert.equal(fundingRowState(''), 'error');
  assert.equal(fundingRowState('something_new'), 'error');
});

test('a 2xx carrying an error is not treated as a completed transfer', () => {
  assert.equal(
    isSettlingResponse({ code: 'funding_landed_unrecorded', error: 'still confirming' }),
    true,
  );
  assert.equal(isSettlingResponse({ error: 'still confirming' }), true);
  assert.equal(isSettlingResponse({}), false);
  assert.equal(isSettlingResponse(null), false);
});

test('a coded failure on a 2xx still reads as a failure', () => {
  assert.equal(isSettlingResponse({ code: 'funding_failed', error: 'nothing moved' }), false);
});
