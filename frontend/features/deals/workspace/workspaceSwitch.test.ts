import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceEnabled } from './workspaceSwitch.js';

test('the new deal page is on only when switched on, or asked for by URL', () => {
  assert.equal(workspaceEnabled(undefined, ''), false);
  assert.equal(workspaceEnabled('0', ''), false);
  assert.equal(workspaceEnabled('1.', ''), false);
  assert.equal(workspaceEnabled('1', ''), true);
  assert.equal(workspaceEnabled(undefined, '?workspace=v2'), true);
  assert.equal(workspaceEnabled('1', '?workspace=v1&handoff=1'), false);
});

test('a stale old-page link opens the new deal page once it is switched on', () => {
  assert.equal(workspaceEnabled('1', '?workspace=v1'), true);
});
