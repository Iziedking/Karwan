import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConfirmAction } from '../assistant/actions.js';
import type { BriefAnswers } from '../agents/agentBriefLines.js';
import { createInterview, type InterviewDeps } from './interview.js';
import type { OutMessage } from './render.js';
import type { ChatAccount, InboundMessage } from './types.js';

/// Set up in two minutes in chat (view 39, 19 Nov): what brings you, where you
/// are (Share my location or typed), one line for what you sell or need, and
/// how we reach you, ending with Here's your Karwan as a confirm card. How you
/// are paid and what the agent does alone start from the website's defaults.
/// A first offer is offered only after the setup is saved.
///
///   npx tsx --test src/channels/interview.test.ts

const at = (over: Partial<ChatAccount> = {}): ChatAccount => ({
  numberHash: 'h1', to: 'tg:1', address: '0xabc', termsVersion: 'x', termsAt: 1, lastInboundAt: null, activated: true, ...over,
});
const text = (t: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'text', text: t });
const tap = (replyId: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'button', replyId });
const shared = (lat: number, lng: number): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'location', location: { lat, lng } });
const bodyOf = (m: OutMessage | undefined) => (m && 'body' in m ? m.body : '');
const idsOf = (m: OutMessage | undefined) => (m?.kind === 'buttons' ? m.buttons.map((b) => b.id) : []);
const consent: OutMessage = { kind: 'text', body: 'Consent?' };

function make(over: Partial<InterviewDeps> = {}) {
  const previewed: BriefAnswers[] = [];
  const saved: ConfirmAction[] = [];
  const iv = createInterview<ChatAccount>({
    afterwards: [consent],
    preview: async (_address, answers) => {
      previewed.push(answers);
      return { lines: [`Your agent offers ${answers.what ?? 'nothing'}`, 'We tell you on Telegram'], needs: [] };
    },
    save: async (_address, card) => {
      saved.push(card);
      return { ok: true };
    },
    near: async (p) => (Math.abs(p.lat - 6.5) < 0.2 ? { country: 'NG', city: 'Lagos', admin: 'Lagos' } : null),
    now: () => 1_000,
    ...over,
  });
  return { iv, previewed, saved };
}

/// Walks a seller to the summary card.
async function toCard(iv: ReturnType<typeof make>['iv'], where: InboundMessage = text('Lagos, Nigeria')) {
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap('ws:brings:sell')))!.account;
  a = (await iv.handle(a, where))!.account;
  a = (await iv.handle(a, text('Logo design, 20 to 40 USDC, 3 days')))!.account;
  return iv.handle(a, tap('ws:reach:telegram'));
}

test('entering asks what brings them, with Sell, Buy or hire and Both', async () => {
  const { iv } = make();
  const r = await iv.enter(at());
  assert.equal(r.account.onboarding?.step, 'brings');
  assert.match(bodyOf(r.out[0]), /What brings you to Karwan\?/);
  assert.deepEqual(idsOf(r.out[0]), ['ws:brings:sell', 'ws:brings:buy', 'ws:brings:both']);
});

test('where comes next, with a Share my location button', async () => {
  const { iv } = make();
  const a = (await iv.enter(at())).account;
  const r = await iv.handle(a, tap('ws:brings:sell'));
  assert.equal(r?.account.onboarding?.step, 'where');
  assert.deepEqual(r?.account.onboarding?.answers?.goals, ['work']);
  assert.equal(r?.out[0]?.kind, 'ask_location');
  assert.equal(r?.out[0]?.kind === 'ask_location' ? r.out[0].label : '', 'Share my location');
});

test('a shared location becomes the nearest town, and the keyboard closes', async () => {
  const { iv } = make();
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap('ws:brings:sell')))!.account;
  const r = await iv.handle(a, shared(6.5244, 3.3792));
  assert.equal(r?.account.onboarding?.step, 'sell');
  const answers = r?.account.onboarding?.answers as BriefAnswers & { place?: unknown };
  assert.equal(answers.where, 'Lagos, NG');
  assert.deepEqual(answers.place, { country: 'NG', city: 'Lagos', admin: 'Lagos', point: { lat: 6.5244, lng: 3.3792 } });
  assert.deepEqual(r?.out[0], { kind: 'text', body: 'Got it: Lagos, NG.', closeKeyboard: true });
  assert.match(bodyOf(r?.out[1]), /What do you sell, and your usual price/);
});

test('a location far from every town asks for the city in words', async () => {
  const { iv } = make();
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap('ws:brings:sell')))!.account;
  const r = await iv.handle(a, shared(40, 10));
  assert.equal(r?.account.onboarding?.step, 'where');
  assert.match(bodyOf(r?.out[0]), /couldn't place that location/);
});

test('a typed place with no country is asked again', async () => {
  const { iv } = make();
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap('ws:brings:sell')))!.account;
  const r = await iv.handle(a, text('somewhere'));
  assert.equal(r?.account.onboarding?.step, 'where');
  assert.match(bodyOf(r?.out[0]), /didn't catch the country/);
});

test('the one sell line is read as what is sold and its price', async () => {
  const { iv, previewed } = make();
  await toCard(iv);
  assert.deepEqual(previewed.at(-1), {
    goals: ['work'], where: 'Lagos, Nigeria', place: { country: 'NG', city: 'Lagos' }, what: 'Logo design', price: '20 to 40 USDC, 3 days', reach: 'telegram', paid: 'one_time', own: 'offers',
  });
});

test('both asks the sell line and then the buy line', async () => {
  const { iv } = make();
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap('ws:brings:both')))!.account;
  a = (await iv.handle(a, text('Lagos, Nigeria')))!.account;
  const sold = await iv.handle(a, text('Phone repairs, about 10 USDC'));
  assert.equal(sold?.account.onboarding?.step, 'buy');
  assert.match(bodyOf(sold?.out[0]), /What do you need, and your budget/);
  const bought = await iv.handle(sold!.account, text('Screens, up to 200 USDC'));
  assert.equal(bought?.account.onboarding?.step, 'reach');
});

test('a buyer is not asked what they sell', async () => {
  const { iv } = make();
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap('ws:brings:buy')))!.account;
  const r = await iv.handle(a, text('Accra, Ghana'));
  assert.equal(r?.account.onboarding?.step, 'buy');
});

test('typing at a choice asks the same question again', async () => {
  const { iv } = make();
  const a = (await iv.enter(at())).account;
  const r = await iv.handle(a, text('sell'));
  assert.equal(r?.account.onboarding?.step, 'brings');
  assert.deepEqual(idsOf(r?.out[0]), ['ws:brings:sell', 'ws:brings:buy', 'ws:brings:both']);
});

test('skip at the first question ends with no card and no hand-off', async () => {
  const { iv } = make();
  const a = (await iv.enter(at())).account;
  const r = await iv.handle(a, text('skip'));
  assert.equal(r?.account.onboarding?.step, 'done');
  assert.equal(r?.handOff, undefined);
  assert.deepEqual(r?.out.at(-1), consent);
});

test('the last message is the Here\'s your Karwan card, kept for the tap', async () => {
  const { iv } = make();
  const r = await toCard(iv);
  const card = r!.out.at(-1)!;
  assert.equal(card.kind, 'buttons');
  assert.match(bodyOf(card), /^\*Here's your Karwan\*/);
  const pending = Object.entries(r!.account.pendingActions ?? {});
  assert.equal(pending.length, 1);
  const [id, kept] = pending[0]!;
  assert.deepEqual(idsOf(card), [`confirm:${id}`, `cancel:${id}`]);
  assert.equal(kept.action.intent, 'save_setup');
  assert.equal(kept.expiresAt, 1_000 + 30 * 60_000);
});

test('the card carries the shared position for the setup route to keep', async () => {
  const { iv } = make();
  const r = await toCard(iv, shared(6.5244, 3.3792));
  const kept = Object.values(r!.account.pendingActions ?? {})[0]!.action as ConfirmAction & { payload: { answers: { place?: unknown } } };
  assert.deepEqual(kept.payload.answers.place, { country: 'NG', city: 'Lagos', admin: 'Lagos', point: { lat: 6.5244, lng: 3.3792 } });
});

test('a price the server cannot read is asked once more, then the card follows', async () => {
  let calls = 0;
  const { iv } = make({ preview: async () => ({ lines: ['x'], needs: calls++ === 0 ? ['price'] : [] }) });
  const again = await toCard(iv);
  assert.equal(again?.account.onboarding?.step, 'price');
  assert.match(bodyOf(again?.out[0]), /couldn't read a price/);
  const card = await iv.handle(again!.account, text('30 USDC'));
  assert.equal(card?.account.onboarding?.step, 'confirm');
});

test('Looks right saves the card, then offers to post the first offer', async () => {
  const { iv, saved } = make();
  const r = await toCard(iv);
  const id = Object.keys(r!.account.pendingActions!)[0]!;
  const done = await iv.handle(r!.account, tap(`confirm:${id}`));
  assert.equal(saved.length, 1);
  assert.equal(done?.account.onboarding?.step, 'post');
  assert.match(bodyOf(done?.out[1]), /Post this as your first offer/);
  const posted = await iv.handle(done!.account, tap('ws:post:yes'));
  assert.equal(posted?.handOff, 'I sell: Logo design. Usually 20 to 40 USDC, 3 days. Post this as my offer.');
  assert.deepEqual(posted?.out.at(-1), consent);
});

test('a save that fails keeps the card for another tap', async () => {
  const { iv } = make({ save: async () => ({ ok: false, message: "That didn't save. Tap Looks right again in a minute." }) });
  const r = await toCard(iv);
  const id = Object.keys(r!.account.pendingActions!)[0]!;
  const failed = await iv.handle(r!.account, tap(`confirm:${id}`));
  assert.equal(failed?.account.onboarding?.step, 'confirm');
  assert.ok(failed?.account.pendingActions?.[id]);
});

test('Change something starts the questions again', async () => {
  const { iv, saved } = make();
  const r = await toCard(iv);
  const id = Object.keys(r!.account.pendingActions!)[0]!;
  const again = await iv.handle(r!.account, tap(`cancel:${id}`));
  assert.equal(saved.length, 0);
  assert.equal(again?.account.onboarding?.step, 'brings');
  assert.deepEqual(again?.account.pendingActions, {});
});

test('an interview left at an earlier interview\'s question starts these', async () => {
  const { iv } = make();
  for (const step of ['role', 'goals', 'clients', 'what'] as const) {
    const r = await iv.handle(at({ onboarding: { step, answers: { goals: ['work'] } } }), text('hi'));
    assert.equal(r?.account.onboarding?.step, 'brings');
  }
});

test('a step that is not the interview\'s is left alone', async () => {
  const { iv } = make();
  assert.equal(await iv.handle(at({ onboarding: { step: 'tag' } }), text('ada')), null);
  assert.equal(await iv.handle(at({ onboarding: { step: 'done' } }), text('hi')), null);
});

test('when the reading fails the last answer is asked for again, nothing is lost', async () => {
  const { iv } = make({ preview: async () => { throw new Error('down'); } });
  const a = at({ onboarding: { step: 'reach', answers: { goals: ['buy'], where: 'Accra, Ghana', buy: 'Rice' } } });
  const r = await iv.handle(a, tap('ws:reach:email'));
  assert.deepEqual(r?.account.onboarding, a.onboarding);
  assert.match(bodyOf(r?.out[0]), /couldn't read that just now/);
});
