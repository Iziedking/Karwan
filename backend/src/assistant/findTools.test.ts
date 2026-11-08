import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantAction } from './actions.js';
import { findTools, type FindToolDeps } from './findTools.js';
import type { StandingNeed } from '../find/needs.js';

/// Being reached and blocking from the assistant (view 72).

const call = { toolCallId: 't1', messages: [] };
const ME = '0xrestaurant';
const TOMATOES: StandingNeed = { id: 'n1', owner: ME, what: 'Fresh tomatoes for my restaurant', every: 'week', budgetUsdc: '33.43', currency: null, kind: 'goods', paused: false, createdAt: 1 };

function setup(over: Partial<FindToolDeps> = {}) {
  const actions: AssistantAction[] = [];
  const deps: FindToolDeps = {
    reachable: async () => true,
    needs: async () => [TOMATOES],
    byTag: async (tag) => (tag === 'ada' ? { address: '0xADA0000000000000000000000000000000000000', handle: 'ada' } : null),
    money: async (_a, usdc) => `₦${Math.round(usdc * 1346).toLocaleString('en')}`,
    ...over,
  };
  return { actions, tools: findTools(ME, actions, deps) };
}

const card = (actions: AssistantAction[]) => actions[0] as unknown as { intent: string; title: string; summary: string; fields: { label: string; value: string }[]; payload: Record<string, unknown> };

test('a need is read back in the person\'s own money, with its id', async () => {
  const s = setup();
  const out = (await s.tools.my_standing_needs.execute!({}, call)) as { reachable: boolean; needs: Array<{ id: string; line: string }> };
  assert.equal(out.reachable, true);
  assert.deepEqual(out.needs[0], { id: 'n1', what: 'Fresh tomatoes for my restaurant', line: 'Every week · about ₦44,997 · delivered', paused: false });
});

test('adding a need is a card that says nothing is paid, with the budget as they read it', async () => {
  const s = setup({ needs: async () => [] });
  await s.tools.propose_standing_need.execute!({ what: 'Office cleaning', every: 'month', budgetUsdc: 59.4, kind: 'in_person' }, call);
  const c = card(s.actions);
  assert.equal(c.intent, 'save_standing_need');
  assert.equal(c.title, 'Add a need');
  assert.match(c.summary, /Nothing is paid until you say yes/);
  assert.deepEqual(c.fields.map((f) => f.value), ['Office cleaning', 'Every month', '₦79,952', 'At my place']);
  assert.deepEqual(c.payload, { what: 'Office cleaning', every: 'month', budgetUsdc: 59.4, kind: 'in_person' });
});

test('a need saved while not reachable says nobody is told yet', async () => {
  const s = setup({ needs: async () => [], reachable: async () => false });
  await s.tools.propose_standing_need.execute!({ what: 'School uniforms', every: 'season', kind: 'goods' }, call);
  assert.match(card(s.actions).summary, /nobody is told/);
});

test('changing needs a real id, and an eleventh need is refused', async () => {
  const s = setup();
  const wrong = await s.tools.propose_standing_need.execute!({ id: 'nope', what: 'Tomatoes', every: 'week', kind: 'goods' }, call);
  assert.match((wrong as { error: string }).error, /not on their list/);
  const full = setup({ needs: async () => Array.from({ length: 10 }, (_, i) => ({ ...TOMATOES, id: `n${i}` })) });
  const out = await full.tools.propose_standing_need.execute!({ what: 'Onions', every: 'week', kind: 'goods' }, call);
  assert.match((out as { error: string }).error, /already keep 10/);
  await s.tools.propose_standing_need.execute!({ id: 'n1', what: 'Tomatoes', every: 'week', kind: 'goods', paused: true }, call);
  assert.equal(card(s.actions).title, 'Change this need');
  assert.equal(card(s.actions).fields.at(-1)?.value, 'Paused');
});

test('removing a need names it', async () => {
  const s = setup();
  await s.tools.propose_remove_standing_need.execute!({ id: 'n1' }, call);
  assert.equal(card(s.actions).intent, 'remove_standing_need');
  assert.deepEqual(card(s.actions).fields, [{ label: 'Need', value: 'Fresh tomatoes for my restaurant' }]);
});

test('a block is by tag, never yourself, and the person is not told', async () => {
  const s = setup();
  await s.tools.propose_block_person.execute!({ tag: '@ada', block: true }, call);
  const c = card(s.actions);
  assert.equal(c.intent, 'block_person');
  assert.equal(c.payload.who, '0xada0000000000000000000000000000000000000');
  assert.match(c.summary, /They are not told/);
  const nobody = await s.tools.propose_block_person.execute!({ tag: 'ghost', block: true }, call);
  assert.match((nobody as { error: string }).error, /Nobody on Karwan/);
  const self = setup({ byTag: async () => ({ address: ME, handle: 'me' }) });
  assert.match(((await self.tools.propose_block_person.execute!({ tag: 'me', block: true }, call)) as { error: string }).error, /their own tag/);
});
