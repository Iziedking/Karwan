import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { firstTradeSteps } = await import('./firstTradeSteps.js');

const fresh = { activated: true, balance: 0, telegram: 'unlinked' as const, startedTrade: false, settledTrade: false };

test('the assistant gives the same next step as Home', () => {
  const view = firstTradeSteps(fresh);
  assert.equal(view.next, 'money');
  assert.deepEqual(view.steps.map((s) => s.key), ['wallets', 'money', 'telegram', 'deal', 'finish']);
  assert.equal(view.steps[1]!.route, '/bridge?direction=in');
});

test('Telegram is left out where the bot is not set up, and the list completes with a finished deal', () => {
  assert.equal(firstTradeSteps({ ...fresh, telegram: 'unavailable' }).steps.length, 4);
  const done = firstTradeSteps({ activated: true, balance: 5, telegram: 'linked', startedTrade: true, settledTrade: true });
  assert.equal(done.complete, true);
  assert.equal(done.next, null);
});
