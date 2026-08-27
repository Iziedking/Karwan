import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORKSPACE_NUDGE_DISMISS_MS,
  chooseWorkspaceNudge,
  workspaceNudgeDismissed,
} from './workspaceNudge';

test('profile setup stays ahead of agent activation', () => {
  assert.equal(
    chooseWorkspaceNudge({
      profileResolved: true,
      hasProfile: false,
      activationResolved: true,
      activated: false,
    }),
    'profile',
  );
});

test('agent activation becomes the next step after profile setup', () => {
  assert.equal(
    chooseWorkspaceNudge({
      profileResolved: true,
      hasProfile: true,
      activationResolved: true,
      activated: false,
    }),
    'activation',
  );
});

test('no setup nudge renders while state is unresolved or setup is complete', () => {
  assert.equal(
    chooseWorkspaceNudge({
      profileResolved: false,
      hasProfile: false,
      activationResolved: false,
      activated: false,
    }),
    null,
  );
  assert.equal(
    chooseWorkspaceNudge({
      profileResolved: true,
      hasProfile: true,
      activationResolved: true,
      activated: true,
    }),
    null,
  );
});

test('dismissal expires so unfinished setup can return', () => {
  const now = 1_800_000_000_000;
  assert.equal(workspaceNudgeDismissed(String(now - 1_000), now), true);
  assert.equal(workspaceNudgeDismissed(String(now - WORKSPACE_NUDGE_DISMISS_MS), now), false);
  assert.equal(workspaceNudgeDismissed('not-a-time', now), false);
});
