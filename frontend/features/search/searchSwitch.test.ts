import assert from 'node:assert/strict';
import test from 'node:test';
import { forcedSearchVersion, searchV2Enabled } from './searchSwitch.js';

test('the new search pages are on only when switched on, or asked for by URL', () => {
  assert.equal(searchV2Enabled(undefined, ''), false);
  assert.equal(searchV2Enabled('0', ''), false);
  assert.equal(searchV2Enabled('true', ''), false);
  assert.equal(searchV2Enabled('1 ', ''), false);
  assert.equal(searchV2Enabled('1', ''), true);
  assert.equal(searchV2Enabled(undefined, '?search=v2'), true);
  assert.equal(searchV2Enabled('1', '?search=v1'), false);
  assert.equal(searchV2Enabled('1', '?mode=direct&search=v1'), false);
  assert.equal(searchV2Enabled(undefined, '?money=v2'), false);
});

test('a forced version is remembered for the session and a new force replaces it', () => {
  assert.equal(searchV2Enabled(undefined, '', 'v2'), true);
  assert.equal(searchV2Enabled('1', '', 'v1'), false);
  assert.equal(searchV2Enabled(undefined, '?search=v1', 'v2'), false);
  assert.equal(searchV2Enabled('1', '', 'garbage'), true);
  assert.equal(searchV2Enabled(undefined, '', null), false);
  assert.equal(forcedSearchVersion('?search=v2&mode=direct'), 'v2');
  assert.equal(forcedSearchVersion('?search=v3'), null);
});
