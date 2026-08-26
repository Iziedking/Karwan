import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEEDBACK_NUDGE_COOLDOWN_MS,
  isFeedbackNudgeRoute,
  shouldOfferFeedbackNudge,
} from './feedbackNudge';

test('feedback is limited to safe workspace hubs', () => {
  assert.equal(isFeedbackNudgeRoute('/app'), true);
  assert.equal(isFeedbackNudgeRoute('/activity/all-time'), true);
  assert.equal(isFeedbackNudgeRoute('/onboarding'), false);
  assert.equal(isFeedbackNudgeRoute('/cashout/abc'), false);
  assert.equal(isFeedbackNudgeRoute('/admin'), false);
  assert.equal(isFeedbackNudgeRoute('/invite/abc'), false);
});

test('feedback is offered once when no prior nudge exists', () => {
  assert.equal(
    shouldOfferFeedbackNudge({
      pathname: '/buyer',
      sessionShown: false,
      lastShownAt: null,
      now: 1_000,
    }),
    true,
  );
});

test('feedback stays quiet after it was shown in this session', () => {
  assert.equal(
    shouldOfferFeedbackNudge({
      pathname: '/seller',
      sessionShown: true,
      lastShownAt: null,
      now: 1_000,
    }),
    false,
  );
});

test('feedback respects the fourteen-day cooldown', () => {
  const now = 20 * 24 * 60 * 60 * 1_000;
  assert.equal(
    shouldOfferFeedbackNudge({
      pathname: '/profile',
      sessionShown: false,
      lastShownAt: now - FEEDBACK_NUDGE_COOLDOWN_MS + 1,
      now,
    }),
    false,
  );
  assert.equal(
    shouldOfferFeedbackNudge({
      pathname: '/profile',
      sessionShown: false,
      lastShownAt: now - FEEDBACK_NUDGE_COOLDOWN_MS,
      now,
    }),
    true,
  );
});
