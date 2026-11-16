import assert from 'node:assert/strict';
import test from 'node:test';
import { newAgentRecord } from '../agents/agentRecord.js';
import { mandateOf } from '../agents/mandate.js';
import { effectOf } from '../agents/mandateEffect.js';
import { createExecutor } from '../channels/executor.js';
import { buildChangeMandateConfirm, proposeChangeMandate, showMyMandate, whatDidMyAgentDo, type MandateToolDeps } from './mandateActions.js';
import type { AgentQuestion } from '../db/agentQuestions.js';

///   npx tsx --test src/assistant/mandateActions.test.ts

const NOW = Date.UTC(2026, 10, 5, 9);
const m = mandateOf(
  { agentWays: { sell: [{ shape: 'one_time', priceMin: 40, priceUsual: 60, daysMin: 3, daysMax: 5 }], buy: [] } },
  newAgentRecord('0xa'),
  [],
);
const facts = { now: NOW, passedForPrice: [{ jobId: 'a', budgetUsdc: 35 }, { jobId: 'b', budgetUsdc: 32 }], openRequests: [] };

test('cardShowsTheChangeAndWhatItDoes', () => {
  const patch = { part: 'sell-price' as const, shape: 'one_time', lowestUsdc: 30 };
  const card = buildChangeMandateConfirm(m, patch, effectOf(m, patch, facts), NOW);
  assert.equal(card.intent, 'change_mandate');
  assert.equal(card.title, 'Change what your agent may do');
  assert.deepEqual(card.fields, [
    { label: 'Now', value: 'Your agent sells work from 40 USDC (usually 60), in 3 to 5 days.' },
    { label: 'After', value: 'Your agent sells work from 30 USDC (usually 60), in 3 to 5 days.' },
    { label: 'What it does next', value: 'Lowering your lowest to 30 USDC re-opens 2 requests you passed on this week.' },
  ]);
  assert.deepEqual(card.payload, { patch });
  assert.equal(card.warning, undefined);
  const goal = buildChangeMandateConfirm(m, { part: 'goal-add', kind: 'buy', text: 'a logo designer' }, effectOf(m, { part: 'goal-add', kind: 'buy', text: 'a logo designer' }, facts), NOW);
  assert.deepEqual(goal.fields.map((f) => f.label), ['After', 'What it does next']);
  const fr = buildChangeMandateConfirm(m, patch, effectOf(m, patch, facts, 'fr'), NOW, 'fr');
  assert.equal(fr.fields[2]!.label, 'Ce qu’il fera ensuite');
});

test('cardIdIsFresh', () => {
  const patch = { part: 'quiet-off' as const };
  const a = buildChangeMandateConfirm(m, patch, effectOf(m, patch, facts), NOW);
  const b = buildChangeMandateConfirm(m, patch, effectOf(m, patch, facts), NOW);
  assert.notEqual(a.id, b.id);
  assert.match(a.id, /^change_mandate:/);
});

const question = (jobId: string, budgetUsdc: number, state: AgentQuestion['state']): AgentQuestion => ({
  id: jobId, owner: '0xa', side: 'seller', jobId, kind: 'price-below-floor', title: jobId, facts: { budgetUsdc }, suggested: {}, state, answer: null,
  mandateVersion: 1, createdAt: NOW, updatedAt: NOW, remindedAt: null, defaultChoice: 'no', defaultPriceUsdc: null, decideAt: null,
});

function toolDeps(over: Partial<MandateToolDeps> = {}): MandateToolDeps {
  return {
    read: async () => ({ mandate: m, locale: 'en' }),
    questionsSince: async () => [question('a', 35, 'expired'), question('b', 20, 'expired')],
    openRequests: async () => [{ jobId: 'x', budgetUsdc: 120 }],
    toldSince: async () => [
      { owner: '0xa', day: '2026-11-05', kind: 'brief', key: 'day', at: NOW, state: 'sent', data: { lines: ['2 offers on Logo, best 40 USDC.'] } },
      { owner: '0xa', day: '2026-11-05', kind: 'insight', key: 'cheaper:job-x', at: NOW - 1, state: 'planned', data: { in: 'note', lines: ['Logo: 2 sellers charge less.'] } },
      { owner: '0xa', day: '2026-11-05', kind: 'insight', key: 'slow:job-y', at: NOW - 2, state: 'sent', data: { in: 'brief' } },
      { owner: '0xa', day: '2026-11-04', kind: 'brief', key: 'day', at: NOW - 3, state: 'sent', data: { lines: [] } },
    ],
    ...over,
  };
}

test('show_my_mandate says each part', async () => {
  const r = await showMyMandate(toolDeps(), '0xa', NOW);
  assert.ok('lines' in r);
  assert.equal(r.lines![0], 'Your agent sells work from 40 USDC (usually 60), in 3 to 5 days.');
  assert.deepEqual(await showMyMandate(toolDeps({ read: async () => null }), '0xa', NOW), { error: 'Finish setting up your agent first.' });
});

test('propose_change_mandate builds a card from one change and never applies it', async () => {
  const r = await proposeChangeMandate(toolDeps(), '0xa', { part: 'sell-price', shape: 'one_time', lowestUsdc: 30, mode: 'ignored' }, NOW);
  assert.ok('card' in r);
  assert.equal(r.effect, 'Lowering your lowest to 30 USDC re-opens 1 request you passed on this week.');
  assert.deepEqual(r.card.payload, { patch: { part: 'sell-price', shape: 'one_time', lowestUsdc: 30 } });
  const most = await proposeChangeMandate(toolDeps(), '0xa', { part: 'buy-most', usdc: 100 }, NOW);
  assert.ok('card' in most);
  assert.equal(most.effect, 'New requests will spend up to 100 USDC. 1 of your open requests asks for more; its budget stays until you post it again.');
  assert.deepEqual(await proposeChangeMandate(toolDeps(), '0xa', { part: 'weekly-limit', usdc: 9 }, NOW), { error: 'The weekly limit can be 0 to 5 USDC.' });
  assert.ok('error' in (await proposeChangeMandate(toolDeps(), '0xa', { part: 'everything' }, NOW)));
});

test('what_did_my_agent_do reads the log', async () => {
  const r = await whatDidMyAgentDo(toolDeps(), '0xa', 'today', NOW);
  assert.deepEqual(r.told.map((t) => [t.kind, t.sent, t.lines]), [['brief', true, ['2 offers on Logo, best 40 USDC.']], ['note', false, ['Logo: 2 sellers charge less.']]]);
  const none = await whatDidMyAgentDo(toolDeps({ toldSince: async () => [] }), '0xa', 'week', NOW);
  assert.match(none.next, /not sent them anything/);
});

test('executorRoutesTheCard', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const execute = createExecutor({
    call: async (_a, method, path, body) => {
      calls.push({ method, path, body });
      return { status: 200, json: { replan: { line: 'Done. Your agent works this way from now on.' } } };
    },
  });
  const patch = { part: 'weekly-limit' as const, usdc: 1 };
  const card = buildChangeMandateConfirm(m, patch, effectOf(m, patch, facts), NOW);
  const r = await execute({ address: '0xa' }, card);
  assert.deepEqual(calls, [{ method: 'POST', path: '/api/agents/mandate', body: { patch, cardId: card.id } }]);
  assert.deepEqual(r, { ok: true, summary: 'Done. Your agent works this way from now on.' });
  const again = await execute({ address: '0xa' }, card);
  assert.equal(again.ok, false);
  assert.equal(calls.length, 1);
});

/// View 87, step 2: the same switches from the assistant.

const agreeing = mandateOf({ agentPrefs: { agentMode: 'agree' as const } }, newAgentRecord('0xa'), []);
const open = (over: Partial<MandateToolDeps> = {}) => toolDeps({ read: async () => ({ mandate: agreeing, locale: 'en' }), lockOpen: () => true, ...over });

test('a switch is one card whose lines differ only in what the agent does alone', async () => {
  const r = await proposeChangeMandate(open(), '0xa', { part: 'switch', name: 'bargain', on: false }, NOW);
  assert.ok('card' in r);
  assert.deepEqual(r.card.payload, { patch: { part: 'switch', name: 'bargain', on: false } });
  assert.equal(r.needsPresence, false);
  assert.deepEqual(r.card.fields.map((f) => f.label), ['Now', 'After', 'What it does next']);
  assert.match(r.card.fields[0]!.value, /^Alone it may: make offers, bargain, agree a price/);
  assert.match(r.card.fields[1]!.value, /Switched off: bargain, lock money\.$/);
  assert.equal(r.effect, 'It stops at once. Deals already running go on.');
});

test('a change that lets the agent lock more says it is confirmed with the passkey', async () => {
  const r = await proposeChangeMandate(open(), '0xa', { part: 'lock-rules', on: true, perDealUsdc: 30, perWeekUsdc: 90 }, NOW);
  assert.ok('card' in r);
  assert.equal(r.needsPresence, true);
  assert.deepEqual(r.card.fields.at(-1), { label: 'To confirm', value: 'Your passkey, on Karwan' });
  assert.ok(r.card.fields.some((f) => f.value.includes('Lock money: at most 30 USDC a deal and 90 USDC a week, only with people who have a record, 3 a day.')));
  const off = await proposeChangeMandate(open(), '0xa', { part: 'switch', name: 'lock', on: false }, NOW);
  assert.ok('card' in off);
  assert.equal(off.needsPresence, false);
});

test('where Lock money is closed the tool says so and builds no card', async () => {
  for (const deps of [open({ lockOpen: () => false }), toolDeps({ read: async () => ({ mandate: agreeing, locale: 'en' }) })]) {
    assert.deepEqual(await proposeChangeMandate(deps, '0xa', { part: 'lock-rules', on: true, perDealUsdc: 30, perWeekUsdc: 90 }, NOW), { error: 'Lock money is not open here yet.' });
    assert.deepEqual(await proposeChangeMandate(deps, '0xa', { part: 'switch', name: 'lock', on: true }, NOW), { error: 'Lock money is not open here yet.' });
    assert.ok('card' in (await proposeChangeMandate(deps, '0xa', { part: 'switch', name: 'find', on: false }, NOW)));
  }
});

test('turning back on is a card only for an agent that stopped itself', async () => {
  assert.deepEqual(await proposeChangeMandate(open(), '0xa', { part: 'resume' }, NOW), { error: 'Your agent has not stopped.' });
  const stopped = mandateOf({ agentPrefs: { agentMode: 'agree' as const } }, { ...newAgentRecord('0xa'), stopped: { at: NOW, reason: 'lock-failures' as const } }, []);
  const deps = open({ read: async () => ({ mandate: stopped, locale: 'en' }) });
  const r = await proposeChangeMandate(deps, '0xa', { part: 'resume' }, NOW);
  assert.ok('card' in r);
  assert.equal(r.needsPresence, false);
  assert.equal(r.card.fields[0]!.value, 'Your agent stopped. Locking money failed 3 times in a row.');
  const shown = await showMyMandate(deps, '0xa', NOW);
  assert.equal(shown.lines![0], 'Your agent stopped. Locking money failed 3 times in a row.');
});
