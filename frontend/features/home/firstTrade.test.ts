import assert from 'node:assert/strict';
import test from 'node:test';
import { firstTrade } from './firstTrade';

const fresh = { activated: true, balance: 0, telegram: 'unlinked' as const, startedTrade: false, settledTrade: false, setupDone: true, goals: [] as Array<'record'>, ownClients: false };

test('a new account sees the steps, with the first unfinished one as its next move', () => {
  const view = firstTrade(fresh);
  assert.equal(view.visible, true);
  assert.deepEqual(view.steps.map((s) => [s.key, s.done]), [
    ['wallets', true], ['money', false], ['telegram', false], ['deal', false], ['finish', false],
  ]);
  assert.equal(view.next, 'money');
  assert.equal(view.done, 1);
});

test('each step ticks itself from what is true', () => {
  const view = firstTrade({ ...fresh, balance: 12.5, telegram: 'linked', startedTrade: true });
  assert.equal(view.next, 'finish');
  assert.equal(view.done, 4);
});

test('steps do not have to be done in order, and the next move skips what is done', () => {
  assert.equal(firstTrade({ ...fresh, activated: false, balance: 40 }).next, 'wallets');
  assert.equal(firstTrade({ ...fresh, telegram: 'linked' }).next, 'money');
});

test('Telegram is left out where the bot is not set up', () => {
  const view = firstTrade({ ...fresh, telegram: 'unavailable' });
  assert.equal(view.steps.some((s) => s.key === 'telegram'), false);
  assert.equal(view.steps.length, 4);
});

test('the checklist goes away after the first finished deal, and waits while anything is loading', () => {
  assert.equal(firstTrade({ ...fresh, settledTrade: true }).visible, false);
  assert.equal(firstTrade({ ...fresh, balance: null }).visible, false);
  assert.equal(firstTrade({ ...fresh, telegram: null }).visible, false);
});

test('a fresh account starts by telling its agent about its work', () => {
  const view = firstTrade({ ...fresh, setupDone: false });
  assert.equal(view.steps[0]!.key, 'setup');
  assert.equal(view.next, 'setup');
});

test('wanting a record adds a step to connect the places you work', () => {
  const keys = firstTrade({ ...fresh, goals: ['record'] }).steps.map((s) => s.key);
  assert.ok(keys.indexOf('connect') === keys.indexOf('telegram') + 1);
});

test('a person with their own clients starts a deal with a payment request', () => {
  assert.equal(firstTrade({ ...fresh, ownClients: true }).dealAction, 'paymentRequest');
  assert.equal(firstTrade(fresh).dealAction, 'market');
});

test('setup still loading keeps the checklist hidden', () => {
  assert.equal(firstTrade({ ...fresh, setupDone: null }).visible, false);
});
