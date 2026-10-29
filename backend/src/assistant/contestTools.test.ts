import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantAction, ConfirmAction } from './actions.js';
import { contestTools } from './contestTools.js';
import { moneyStepPath, MONEY_INTENTS } from '../channels/moneySteps.js';

/// Contests from the assistant (view 40): every figure on the card, nothing
/// moves until the person confirms, money steps confirmed on Karwan in chat.

const ME = '0x1111111111111111111111111111111111111111';
const call = { toolCallId: 't1', messages: [] };
const card = { title: 'Best logo', prizeMicros: '300000000', feeHalfMicros: '1500000', totalMicros: '301500000', placeNetMicros: ['149250000', '89550000', '59700000'], entriesBy: Date.UTC(2026, 10, 5), awardBy: Date.UTC(2026, 10, 12), ifNobody: 'If you pick nobody by then, the prize comes back to you.' };

function setup(routes: Record<string, { status: number; json: Record<string, unknown> }>, held = 0) {
  const actions: AssistantAction[] = [];
  const seen: string[] = [];
  const tools = contestTools(ME, actions, {
    call: async (_a, method, path) => {
      seen.push(`${method} ${path}`);
      return routes[`${method} ${path}`] ?? { status: 404, json: { error: 'No contest with that id.' } };
    },
    heldEntryFiles: () => held,
  });
  return { tools, actions, seen };
}

test('a contest card shows the prize, the fee, the total and each place before anything moves', async () => {
  const s = setup({ 'POST /api/contests/draft': { status: 200, json: { card } } });
  await s.tools.propose_contest.execute!({ title: 'Best logo', brief: 'A bakery logo', prizeUsdc: 300, places: 3, entriesDays: 7 }, call);
  const c = s.actions[0] as ConfirmAction;
  assert.equal(c.intent, 'contest_post');
  assert.deepEqual(c.fields.map((f) => f.value), ['300.00 USDC', '1.50 USDC', '301.50 USDC', '149.25 USDC', '89.55 USDC', '59.70 USDC']);
  assert.match(c.warning ?? '', /comes back/);
  assert.deepEqual(s.seen, ['POST /api/contests/draft'], 'only the draft is read; nothing is posted');
});

test('entering needs the work sent first', async () => {
  const contest = { 'GET /api/contests/c_1': { status: 200, json: { title: 'Best logo' } } };
  const none = setup(contest, 0);
  const r = (await none.tools.propose_contest_entry.execute!({ contestId: 'c_1', note: '' }, call)) as { error?: string };
  assert.match(r.error ?? '', /Send me your work/);
  const two = setup(contest, 2);
  await two.tools.propose_contest_entry.execute!({ contestId: 'c_1', note: 'blue and gold' }, call);
  assert.equal((two.actions[0] as ConfirmAction).intent, 'contest_enter');
});

test('only the buyer gets a card to pay the winners, and only for entries in the contest', async () => {
  const stranger = setup({ 'GET /api/contests/c_1': { status: 200, json: { title: 'Best logo' } } });
  const r = (await stranger.tools.propose_contest_award.execute!({ contestId: 'c_1', entryIds: ['e_1'] }, call)) as { error?: string };
  assert.match(r.error ?? '', /Only the buyer/);
  const buyer = setup({
    'GET /api/contests/c_1': { status: 200, json: { title: 'Best logo', mine: true, entryList: [{ id: 'e_1', seller: '@ada', note: '', status: 'in' }] } },
    'POST /api/contests/c_1/award/card': { status: 200, json: { card: { netMicros: ['149250000'], backMicros: '150750000' } } },
  });
  const wrong = (await buyer.tools.propose_contest_award.execute!({ contestId: 'c_1', entryIds: ['e_9'] }, call)) as { error?: string };
  assert.match(wrong.error ?? '', /Only entries/);
  await buyer.tools.propose_contest_award.execute!({ contestId: 'c_1', entryIds: ['e_1'] }, call);
  const c = buyer.actions[0] as ConfirmAction;
  assert.deepEqual(c.fields, [{ label: 'First place, @ada', value: '149.25 USDC' }, { label: 'Comes back to you', value: '150.75 USDC' }]);
});

test('in chat, posting and paying winners open Karwan to confirm; entering does not', () => {
  assert.ok(MONEY_INTENTS.has('contest_post') && MONEY_INTENTS.has('contest_award') && MONEY_INTENTS.has('contest_cancel'));
  assert.ok(!MONEY_INTENTS.has('contest_enter'));
  const post = moneyStepPath({ intent: 'contest_post', payload: { title: 'Best logo', brief: 'A bakery logo', prizeUsdc: '300', places: 3, entriesDays: 7 } } as ConfirmAction);
  assert.equal(post, '/contests/new?title=Best+logo&brief=A+bakery+logo&prize=300&places=3&days=7');
  assert.equal(moneyStepPath({ intent: 'contest_award', payload: { contestId: 'c_abc', entryIds: [] } } as unknown as ConfirmAction), '/contests/c_abc');
  assert.equal(moneyStepPath({ intent: 'contest_award', payload: { contestId: '../x', entryIds: [] } } as unknown as ConfirmAction), null);
});
