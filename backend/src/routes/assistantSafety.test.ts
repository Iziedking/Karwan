import assert from 'node:assert/strict';
import test from 'node:test';
import { requiresLiveAccountState } from '../assistant/safety.js';

test('stateful assistant prompts require the live account read model', () => {
  assert.equal(
    requiresLiveAccountState([{ role: 'user', content: 'why did my bridge fail?' }]),
    true,
  );
  assert.equal(
    requiresLiveAccountState([{ role: 'user', content: 'what is my balance?' }]),
    true,
  );
});

test('static product questions can use the knowledge provider fallback', () => {
  assert.equal(
    requiresLiveAccountState([{ role: 'user', content: 'how does Karwan protect a trade?' }]),
    false,
  );
  assert.equal(
    requiresLiveAccountState([{ role: 'user', content: 'how does agent matching work?' }]),
    false,
  );
});

test('account-specific agent questions require live state', () => {
  assert.equal(
    requiresLiveAccountState([{ role: 'user', content: 'what is my agent balance?' }]),
    true,
  );
  assert.equal(
    requiresLiveAccountState([{ role: 'user', content: 'show my pending matches' }]),
    true,
  );
});

test('finding, browsing and creating on Karwan are help, not account state', () => {
  for (const content of ['Find a seller', 'find customers', 'browse the market', 'post an offer', 'create a payment link']) {
    assert.equal(requiresLiveAccountState([{ role: 'user', content }]), false, content);
  }
  for (const content of ['send 5 usdc to @ada', 'what about now?', 'find my deal with ada', 'show my pending matches']) {
    assert.equal(requiresLiveAccountState([{ role: 'user', content }]), true, content);
  }
});

test('an earlier balance question does not make a later product question stateful', () => {
  const history = [
    { role: 'user' as const, content: 'what is my balance?' },
    { role: 'assistant' as const, content: 'Your wallet holds 10 USDC.' },
  ];
  assert.equal(
    requiresLiveAccountState([...history, { role: 'user', content: 'can you help me find customers to trade with on karwan ?' }]),
    false,
  );
  assert.equal(
    requiresLiveAccountState([...history, { role: 'user', content: 'what about now?' }]),
    true,
  );
});
