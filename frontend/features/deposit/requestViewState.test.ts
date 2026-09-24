import test from 'node:test';
import assert from 'node:assert/strict';
import { requestViewState } from './requestViewState';

test('a pay link shows one state at a time and never "unavailable" while loading', () => {
  assert.equal(requestViewState({ isPending: true, isError: false, hasRequest: false }), 'loading');
  assert.equal(requestViewState({ isPending: false, isError: false, hasRequest: true }), 'ready');
  assert.equal(requestViewState({ isPending: false, isError: false, hasRequest: false }), 'unavailable');
  assert.equal(requestViewState({ isPending: false, isError: true, hasRequest: false }), 'unavailable');
});
