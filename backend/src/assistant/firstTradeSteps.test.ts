import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { firstTradeSteps } = await import('./firstTradeSteps.js');

const fresh = { activated: true, balance: 0, telegram: 'unlinked' as const, startedTrade: false, settledTrade: false, setupDone: true, goals: [] as string[], ownClients: false, connected: false };

test('the assistant gives the same next step as Home', () => {
  const view = firstTradeSteps(fresh);
  assert.equal(view.next, 'money');
  assert.deepEqual(view.steps.map((s) => s.key), ['wallets', 'money', 'telegram', 'deal', 'finish']);
  assert.equal(view.steps[1]!.route, '/profile/wallets', 'testnet starts at the faucet');
  assert.equal(firstTradeSteps(fresh, 'mainnet').steps[1]!.route, '/bridge?direction=in');
});

test('Telegram is left out where the bot is not set up, and the list completes with a finished deal', () => {
  assert.equal(firstTradeSteps({ ...fresh, telegram: 'unavailable' }).steps.length, 4);
  const done = firstTradeSteps({ ...fresh, balance: 5, telegram: 'linked', startedTrade: true, settledTrade: true });
  assert.equal(done.complete, true);
  assert.equal(done.next, null);
});

test('the assistant also starts a fresh account with setup, and follows the answers', () => {
  const view = firstTradeSteps({ ...fresh, setupDone: false, goals: ['record'], ownClients: true });
  assert.equal(view.next, 'setup');
  assert.equal(view.steps[0]!.route, '/setup');
  assert.equal(view.steps.find((s) => s.key === 'connect')?.route, '/profile/setup');
  assert.equal(view.steps.find((s) => s.key === 'deal')?.route, '/request');
});
