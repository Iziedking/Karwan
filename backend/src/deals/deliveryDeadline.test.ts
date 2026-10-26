import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import {
  DEADLINE_REMIND_BEFORE_MS,
  WAITING_REMINDERS,
  WAITING_REMIND_EVERY_MS,
  approvedDeadline,
  deadlineReminderDue,
  sellerMayAskMoreTime,
  waitingReminderDue,
} from './deliveryDeadline.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const GRACE = DAY;
const DEADLINE_S = 1_800_000_000;
const DEADLINE_MS = DEADLINE_S * 1000;

const deal = (over: Partial<DirectDeal> = {}): DirectDeal =>
  ({ jobId: 'deal-1', buyer: '0xb', seller: '0xs', acceptedAt: DEADLINE_MS - 10 * DAY, deadlineUnix: DEADLINE_S, ...over }) as DirectDeal;

const ask = (requestedAt: number) => ({ requestedBy: 'seller' as const, requestedAt, additionalSeconds: 2 * 86_400 });

test('reminds the seller in the last day, once per date', () => {
  assert.equal(deadlineReminderDue(deal(), DEADLINE_MS - DEADLINE_REMIND_BEFORE_MS - 1), false);
  assert.equal(deadlineReminderDue(deal(), DEADLINE_MS - DEADLINE_REMIND_BEFORE_MS), true);
  assert.equal(deadlineReminderDue(deal({ deadlineRemindedFor: DEADLINE_S }), DEADLINE_MS - HOUR), false);
  // A new date after an approval gets its own reminder.
  assert.equal(deadlineReminderDue(deal({ deadlineRemindedFor: DEADLINE_S - 86_400 }), DEADLINE_MS - HOUR), true);
});

test('a short delivery time is reminded halfway, not at once', () => {
  const short = deal({ acceptedAt: DEADLINE_MS - 2 * HOUR });
  assert.equal(deadlineReminderDue(short, DEADLINE_MS - 2 * HOUR + 1), false);
  assert.equal(deadlineReminderDue(short, DEADLINE_MS - HOUR), true);
});

test('no reminder once the date passed, after delivery, or while a request waits', () => {
  assert.equal(deadlineReminderDue(deal(), DEADLINE_MS), false);
  assert.equal(deadlineReminderDue(deal({ delivered: true }), DEADLINE_MS - HOUR), false);
  assert.equal(deadlineReminderDue(deal({ extensionRequest: ask(DEADLINE_MS - 2 * HOUR) }), DEADLINE_MS - HOUR), false);
  assert.equal(deadlineReminderDue(deal({ deadlineUnix: undefined }), DEADLINE_MS - HOUR), false);
  assert.equal(deadlineReminderDue(deal({ disputed: true }), DEADLINE_MS - HOUR), false);
});

test('an unanswered request holds the refund and reminds the buyer three times, a day apart', () => {
  const pending = deal({ extensionRequest: ask(DEADLINE_MS + HOUR) });
  const refundAt = DEADLINE_MS + GRACE;
  assert.equal(waitingReminderDue(pending, refundAt - 1, GRACE), null);
  assert.equal(waitingReminderDue(pending, refundAt, GRACE), 1);
  const first = deal({ ...pending, extensionWaitReminder: { requestedAt: DEADLINE_MS + HOUR, count: 1, lastAt: refundAt } });
  assert.equal(waitingReminderDue(first, refundAt + WAITING_REMIND_EVERY_MS - 1, GRACE), null);
  assert.equal(waitingReminderDue(first, refundAt + WAITING_REMIND_EVERY_MS, GRACE), 2);
  const done = deal({ ...pending, extensionWaitReminder: { requestedAt: DEADLINE_MS + HOUR, count: WAITING_REMINDERS, lastAt: refundAt } });
  assert.equal(waitingReminderDue(done, refundAt + 10 * DAY, GRACE), null);
  // Another request starts its own count.
  const replaced = deal({ ...done, extensionRequest: ask(DEADLINE_MS + 2 * HOUR) });
  assert.equal(waitingReminderDue(replaced, refundAt + 10 * DAY, GRACE), 1);
  assert.equal(waitingReminderDue(deal(), refundAt, GRACE), null);
});

test('the seller asks any time before the date, once after it, and not after the grace', () => {
  assert.equal(sellerMayAskMoreTime(deal(), DEADLINE_MS - HOUR, GRACE), 'ok');
  const declinedBefore = deal({ extensionHistory: [{ ...ask(DEADLINE_MS - DAY), decidedAt: DEADLINE_MS - HOUR, decision: 'declined' }] });
  assert.equal(sellerMayAskMoreTime(declinedBefore, DEADLINE_MS + HOUR, GRACE), 'ok');
  const declinedAfter = deal({ extensionHistory: [{ ...ask(DEADLINE_MS + HOUR), decidedAt: DEADLINE_MS + 2 * HOUR, decision: 'declined' }] });
  assert.equal(sellerMayAskMoreTime(declinedAfter, DEADLINE_MS + 3 * HOUR, GRACE), 'already-asked');
  assert.equal(sellerMayAskMoreTime(deal(), DEADLINE_MS + GRACE + 1, GRACE), 'too-late');
  assert.equal(sellerMayAskMoreTime(deal({ deadlineUnix: undefined }), DEADLINE_MS, GRACE), 'no-deadline');
});

test('an approval counts the extra days from the later of the old date and now', () => {
  assert.equal(approvedDeadline(DEADLINE_S, DEADLINE_S - 3_600, 86_400), DEADLINE_S + 86_400);
  assert.equal(approvedDeadline(DEADLINE_S, DEADLINE_S + 5 * 86_400, 86_400), DEADLINE_S + 6 * 86_400);
});
