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
