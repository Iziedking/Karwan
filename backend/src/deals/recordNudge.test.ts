import assert from 'node:assert/strict';
import test from 'node:test';
import { RECORD_NUDGE_EVERY_MS, recordNudgeDue } from './recordNudge.js';

const NOW = 1_800_000_000_000;
const due = (over: Partial<Parameters<typeof recordNudgeDue>[0]> = {}) =>
  recordNudgeDue({ side: 'missing', ownWallet: true, recordComplete: false, shownAt: undefined, nowMs: NOW, ...over });

test('nudge_shows_for_own_wallet_side_missing', () => {
  assert.equal(due(), true);
});

test('nudge_hidden_within_30_days', () => {
  assert.equal(due({ shownAt: NOW - RECORD_NUDGE_EVERY_MS + 1 }), false);
  assert.equal(due({ shownAt: NOW - RECORD_NUDGE_EVERY_MS }), true);
  assert.equal(RECORD_NUDGE_EVERY_MS, 30 * 86_400_000);
});

test('nudge_hidden_when_side_recorded', () => {
  assert.equal(due({ side: 'recorded' }), false);
  assert.equal(due({ side: 'pending' }), false);
  assert.equal(due({ side: undefined }), false);
});

test('nudge_hidden_for_held_wallet', () => {
  assert.equal(due({ ownWallet: false }), false);
});

test('nudge_hidden_when_record_now_complete', () => {
  assert.equal(due({ recordComplete: true }), false);
});
