import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { setupSteps } = await import('./setupSteps.js');

const fresh = {
  setupDone: false,
  balance: 0,
  agentsBalance: 0,
  agentMode: false,
  priceSet: true,
  telegram: 'unlinked' as const,
  reach: null,
  startedTrade: false,
  settledTrade: false,
  ownClients: false,
};

test('a new account starts at setup, six steps in order', () => {
  const view = setupSteps(fresh, 'mainnet');
  assert.equal(view.next, 'setup');
  assert.equal(view.known, true);
  assert.deepEqual(view.steps.map((s) => s.key), ['setup', 'money', 'agent_money', 'agent_limits', 'telegram', 'first_deal']);
  assert.deepEqual(view.steps.map((s) => s.href), ['/setup', '/add', '/account?tab=agent', '/profile/setup', '/profile/contact', '/market']);
  assert.equal(setupSteps(fresh, 'testnet').steps[1]!.href, '/profile/wallets', 'testnet starts at the faucet');
});

test('each step ticks from what is true', () => {
  const done = (facts: Partial<typeof fresh> & Record<string, unknown>) =>
    Object.fromEntries(setupSteps({ ...fresh, ...facts } as typeof fresh, 'mainnet').steps.map((s) => [s.key, s.done]));
  assert.equal(done({ setupDone: true }).setup, true);
  assert.equal(done({ balance: 1 }).money, true);
  assert.equal(done({ agentsBalance: 0.5 }).agent_money, true);
  assert.equal(done({ agentMode: true, priceSet: false }).agent_limits, false, 'a mode alone is not enough');
  assert.equal(done({ agentMode: true, priceSet: true }).agent_limits, true);
  assert.equal(done({ telegram: 'linked' }).telegram, true);
  assert.equal(done({ startedTrade: true }).first_deal, true);
});

test('telegram is left out when it is not offered, or setup chose email only', () => {
  const rest = { setupDone: true, balance: 2, agentsBalance: 1, agentMode: true, priceSet: true };
  for (const extra of [{ telegram: 'unavailable' as const }, { reach: 'email' as const }]) {
    const view = setupSteps({ ...fresh, ...rest, ...extra }, 'mainnet');
    assert.equal(view.steps.length, 5);
    assert.equal(view.next, 'first_deal');
  }
});

test('the first deal is a payment request for someone with their own clients', () => {
  const view = setupSteps({ ...fresh, ownClients: true }, 'mainnet');
  assert.equal(view.steps.at(-1)!.href, '/request');
});

test('complete once every step is done', () => {
  const view = setupSteps(
    { ...fresh, setupDone: true, balance: 3, agentsBalance: 1, agentMode: true, telegram: 'linked', startedTrade: true },
    'mainnet',
  );
  assert.equal(view.next, null);
  assert.equal(view.complete, true);
});

test('an unread balance is not known, so nothing is asked of the person', () => {
  assert.equal(setupSteps({ ...fresh, balance: null }, 'mainnet').known, false);
  assert.equal(setupSteps({ ...fresh, agentsBalance: null }, 'mainnet').known, false);
});
