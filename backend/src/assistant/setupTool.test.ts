import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '../db/profiles.js';
import { buildSaveSetupConfirm } from './actions.js';
import { mergeSetupAnswers } from './setupTool.js';

/// Setting up or changing the agents from a conversation, confirmed on a card.
///
///   npx tsx --test src/assistant/setupTool.test.ts

test("the card shows Here's your Karwan with each line as a row", () => {
  const card = buildSaveSetupConfirm({ goals: ['work'], what: 'Logo design' }, ['Your agent offers Logo design', 'We tell you on Telegram']);
  assert.equal(card.intent, 'save_setup');
  assert.equal(card.title, "Here's your Karwan");
  assert.deepEqual(card.fields, [{ label: '', value: 'Your agent offers Logo design' }, { label: '', value: 'We tell you on Telegram' }]);
  assert.equal(card.confirmLabel, 'Looks right');
  assert.deepEqual(card.payload, { answers: { goals: ['work'], what: 'Logo design' } });
});

test('a change to one answer keeps everything else that was saved', () => {
  const saved = {
    address: '0xa', role: 'seller', displayName: 'A', createdAt: 0, updatedAt: 0,
    goals: ['work'], ownWords: { what: 'Logo design', price: '20 to 40' }, agentPrefs: { agentMode: 'ask' }, settings: { notifyVia: 'email' },
  } as unknown as UserProfile;
  assert.deepEqual(mergeSetupAnswers(saved, { price: '25 to 45' }), {
    goals: ['work'], what: 'Logo design', price: '25 to 45', own: 'ask', reach: 'email',
  });
});

test('a first setup from chat starts from nothing', () => {
  assert.deepEqual(mergeSetupAnswers(null, { goals: ['buy'], buy: 'Fabric' }), { goals: ['buy'], buy: 'Fabric' });
});

test('Telegram saves the card through the setup route', async () => {
  const { createExecutor } = await import('../channels/executor.js');
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const run = createExecutor({ call: async (_a, method, path, body) => { calls.push({ method, path, body }); return { status: 200, json: {} }; } });
  const card = buildSaveSetupConfirm({ goals: ['work'] }, ['x']);
  await run({ address: '0xa' }, card);
  assert.deepEqual(calls, [{ method: 'POST', path: '/api/setup/save', body: { answers: { goals: ['work'] } } }]);
});
