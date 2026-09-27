import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ATTEMPT_WINDOW_MS, RECOVERY_WAIT_MS, RELEASED_TTL_MS, REMINDER_LEAD_MS,
  attemptGate, canCancel, canRelease, needsReminder, shouldExpire, type RecoveryRequest,
} from './rules.js';

const H = 60 * 60 * 1000;
const req = (over: Partial<RecoveryRequest> = {}): RecoveryRequest => ({
  id: 'r1', walletAddress: '0xa', state: 'waiting', createdAt: 0, releasableAt: RECOVERY_WAIT_MS,
  releasedAt: null, completedAt: null, cancelledAt: null, reminderSentAt: null, ...over,
});

test('release is refused one millisecond before 48 hours and allowed at 48 hours', () => {
  assert.equal(RECOVERY_WAIT_MS, 48 * H);
  assert.deepEqual(canRelease(req(), 48 * H - 1), { ok: false, reason: 'too_early' });
  assert.deepEqual(canRelease(req(), 48 * H), { ok: true });
});

test('a finished request cannot be released; a released one reopens until it expires', () => {
  for (const state of ['completed', 'cancelled', 'expired'] as const) {
    assert.deepEqual(canRelease(req({ state }), 100 * H), { ok: false, reason: 'not_waiting' });
  }
  const opened = req({ state: 'released', releasedAt: 50 * H });
  assert.deepEqual(canRelease(opened, 60 * H), { ok: true });
  assert.deepEqual(canRelease(opened, 74 * H), { ok: false, reason: 'not_waiting' });
});

test('waiting and released requests can be cancelled; finished ones cannot', () => {
  assert.equal(canCancel(req()), true);
  assert.equal(canCancel(req({ state: 'released' })), true);
  for (const state of ['completed', 'cancelled', 'expired'] as const) assert.equal(canCancel(req({ state })), false);
});

test('a released request that never completes expires after 24 hours', () => {
  const r = req({ state: 'released', releasedAt: 50 * H });
  assert.equal(RELEASED_TTL_MS, 24 * H);
  assert.equal(shouldExpire(r, 74 * H - 1), false);
  assert.equal(shouldExpire(r, 74 * H), true);
  assert.equal(shouldExpire(req(), 1000 * H), false);
});

test('the reminder goes once, one hour before release', () => {
  assert.equal(REMINDER_LEAD_MS, H);
  assert.equal(needsReminder(req(), 47 * H - 1), false);
  assert.equal(needsReminder(req(), 47 * H), true);
  assert.equal(needsReminder(req({ reminderSentAt: 47 * H }), 47.5 * H), false);
});

test('five failures in 24 hours lock until 24 hours after the fifth', () => {
  const fails = [1, 2, 3, 4, 5].map((i) => i * H);
  assert.deepEqual(attemptGate(fails.slice(0, 4), 6 * H), { allowed: true });
  assert.deepEqual(attemptGate(fails, 6 * H), { allowed: false, retryAt: 5 * H + ATTEMPT_WINDOW_MS });
  assert.deepEqual(attemptGate(fails, 5 * H + ATTEMPT_WINDOW_MS), { allowed: true });
  assert.deepEqual(attemptGate([1 * H, 30 * H, 31 * H, 32 * H, 33 * H], 34 * H), { allowed: true }, 'spread-out failures do not lock');
});
