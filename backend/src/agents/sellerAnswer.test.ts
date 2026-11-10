import assert from 'node:assert/strict';
import test from 'node:test';
import { ANSWER_WINDOW_MS, answerBy, choiceState, choiceView, decline, newHold, raise, roleOn, sameChoice, sellerMustAnswer } from './sellerAnswer.js';

const NOW = 1_800_000_000_000;
const hold = () => newHold({ jobId: '0xJOB', sellerAgent: '0xAGENT', sellerUser: '0xSELLER', buyerUser: '0xBUYER', priceUsdc: '120.00', now: NOW });

test('a seller is asked unless they chose Agree for me', () => {
  assert.equal(sellerMustAnswer({ mode: 'offers', agentOn: true, lowestUsdc: 50 }, 120), true);
  assert.equal(sellerMustAnswer({ mode: 'ask', agentOn: true, lowestUsdc: 50 }, 120), true);
  assert.equal(sellerMustAnswer({ mode: 'agree', agentOn: true, lowestUsdc: 50 }, 120), false);
});

test('Agree for me only covers a price inside the seller\'s limits', () => {
  assert.equal(sellerMustAnswer({ mode: 'agree', agentOn: true, lowestUsdc: 150 }, 120), true);
  assert.equal(sellerMustAnswer({ mode: 'agree', agentOn: true, lowestUsdc: 120 }, 120), false);
  assert.equal(sellerMustAnswer({ mode: 'agree', agentOn: true, lowestUsdc: null }, 120), false);
  assert.equal(sellerMustAnswer({ mode: 'agree', agentOn: true, lowestUsdc: 50 }, 0), true);
});

test('with the agent off the seller is always asked', () => {
  assert.equal(sellerMustAnswer({ mode: 'agree', agentOn: false, lowestUsdc: 50 }, 120), true);
});

test('the seller has a day, or until the request\'s own date if sooner', () => {
  assert.equal(answerBy(NOW, null), NOW + ANSWER_WINDOW_MS);
  const soon = Math.floor((NOW + 3 * 60 * 60_000) / 1000);
  assert.equal(answerBy(NOW, soon), soon * 1000);
  const later = Math.floor((NOW + 5 * ANSWER_WINDOW_MS) / 1000);
  assert.equal(answerBy(NOW, later), NOW + ANSWER_WINDOW_MS);
  const past = Math.floor((NOW - 1000) / 1000);
  assert.equal(answerBy(NOW, past), NOW + ANSWER_WINDOW_MS);
});

test('a choice waits, then lapses when the time is up', () => {
  const h = hold();
  assert.equal(choiceState(h, NOW + 1), 'waiting');
  assert.equal(choiceState(h, h.answerBy), 'expired');
  assert.equal(choiceView(h, h.answerBy), null);
  assert.deepEqual(choiceView(h, NOW + 1), { sellerAgent: '0xagent', priceUsdc: '120.00', state: 'waiting', answerBy: h.answerBy });
});

test('asking for more needs a higher price, and happens once', () => {
  const h = hold();
  assert.deepEqual(raise(h, 120, NOW + 1), { ok: false, code: 'NOT_HIGHER' });
  assert.deepEqual(raise(h, 100, NOW + 1), { ok: false, code: 'NOT_HIGHER' });
  const raised = raise(h, 140, NOW + 1);
  assert.ok(raised.ok);
  assert.equal(raised.hold.raisedPriceUsdc, '140.00');
  assert.equal(choiceState(raised.hold, NOW + 2), 'raised');
  assert.deepEqual(raise(raised.hold, 160, NOW + 3), { ok: false, code: 'NOT_WAITING' });
  assert.deepEqual(raise(h, 140, h.answerBy + 1), { ok: false, code: 'EXPIRED' });
});

test('each side is known by their own account, and nobody else has a part', () => {
  const h = hold();
  assert.equal(roleOn(h, '0xSeller'), 'seller');
  assert.equal(roleOn(h, '0xbuyer'), 'buyer');
  assert.equal(roleOn(h, '0xother'), null);
  assert.equal(roleOn(null, '0xbuyer'), null);
});

test('the same seller at the same price is the same choice', () => {
  const h = hold();
  assert.equal(sameChoice(h, '0xAgent', '120'), true);
  assert.equal(sameChoice(h, '0xAgent', '121'), false);
  assert.equal(sameChoice(h, '0xother', '120'), false);
  assert.equal(sameChoice(null, '0xAgent', '120'), false);
});

test('what a side reads names no person and no limit', () => {
  const view = choiceView(hold(), NOW + 1);
  assert.equal(JSON.stringify(view).includes('0xseller'), false);
  assert.equal(JSON.stringify(view).includes('0xbuyer'), false);
});

test('a no is remembered until the time is up, so the seller is not asked twice', () => {
  const h = decline(hold(), NOW + 10);
  assert.equal(choiceState(h, NOW + 20), 'declined');
  assert.equal(choiceView(h, NOW + 20)?.state, 'declined');
  assert.deepEqual(raise(h, 140, NOW + 20), { ok: false, code: 'NOT_WAITING' });
  assert.equal(choiceState(h, h.answerBy), 'expired');
});
