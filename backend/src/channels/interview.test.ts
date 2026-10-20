import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConfirmAction } from '../assistant/actions.js';
import type { BriefAnswers } from '../agents/agentBriefLines.js';
import { createInterview, type InterviewDeps } from './interview.js';
import type { OutMessage } from './render.js';
import type { ChatAccount, InboundMessage } from './types.js';

/// The chat asks the same setup questions as /setup, with buttons for the
/// choices, and ends with Here's your Karwan as a confirm card. A first offer
/// is offered only after the setup is saved.
///
///   npx tsx --test src/channels/interview.test.ts

const at = (over: Partial<ChatAccount> = {}): ChatAccount => ({
  numberHash: 'h1', to: 'tg:1', address: '0xabc', termsVersion: 'x', termsAt: 1, lastInboundAt: null, activated: true, ...over,
});
const text = (t: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'text', text: t });
const tap = (replyId: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'button', replyId });
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
    now: () => 1_000,
    ...over,
  });
  return { iv, previewed, saved };
}

/// Walks a seller who has clients to the summary card.
async function toCard(iv: ReturnType<typeof make>['iv']) {
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap('ws:goal:work')))!.account;
  a = (await iv.handle(a, tap('ws:goals:done')))!.account;
  a = (await iv.handle(a, text('Logo design')))!.account;
  a = (await iv.handle(a, text('20 to 40 USDC, 3 days')))!.account;
  a = (await iv.handle(a, tap('ws:clients:own')))!.account;
  a = (await iv.handle(a, tap('ws:own:offers')))!.account;
  a = (await iv.handle(a, tap('ws:reach:telegram')))!.account;
  return iv.handle(a, text('Lagos, Nigeria'));
}

test('entering asks what Karwan should do, with a button per goal and Done', async () => {
  const { iv } = make();
  const r = await iv.enter(at());
  assert.equal(r.account.onboarding?.step, 'goals');
  assert.match(bodyOf(r.out[0]), /What do you want Karwan to do for you/);
  assert.deepEqual(idsOf(r.out[0]), ['ws:goal:work', 'ws:goal:sell', 'ws:goal:buy', 'ws:goal:business', 'ws:goal:record', 'ws:goals:done']);
});

test('a goal tap ticks it and asks again; Done with nothing picked asks again', async () => {
  const { iv } = make();
  let a = (await iv.enter(at())).account;
  const none = await iv.handle(a, tap('ws:goals:done'));
  assert.equal(none?.account.onboarding?.step, 'goals');
  const ticked = await iv.handle(a, tap('ws:goal:sell'));
  a = ticked!.account;
  assert.deepEqual(a.onboarding?.answers?.goals, ['sell']);
  const sell = ticked!.out[0]!.kind === 'buttons' ? ticked!.out[0]!.buttons.find((b) => b.id === 'ws:goal:sell') : undefined;
  assert.match(sell?.title ?? '', /^✓ /);
  const untick = await iv.handle(a, tap('ws:goal:sell'));
  assert.deepEqual(untick?.account.onboarding?.answers?.goals, []);
});

test('only the questions the goals need are asked, text in free words and choices as buttons', async () => {
  const { iv } = make();
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap('ws:goal:sell')))!.account;
  const what = await iv.handle(a, tap('ws:goals:done'));
  assert.match(bodyOf(what?.out[0]), /What do you sell/);
  const price = await iv.handle(what!.account, text('Ankara fabric'));
  assert.match(bodyOf(price?.out[0]), /usual price/);
  const clients = await iv.handle(price!.account, text('About 30 USDC a piece'));
  assert.deepEqual(idsOf(clients?.out[0]), ['ws:clients:own', 'ws:clients:find', 'ws:clients:both']);
  const own = await iv.handle(clients!.account, tap('ws:clients:find'));
  assert.deepEqual(idsOf(own?.out[0]), ['ws:own:offers', 'ws:own:ask']);
  const reach = await iv.handle(own!.account, tap('ws:own:ask'));
  assert.deepEqual(idsOf(reach?.out[0]), ['ws:reach:telegram', 'ws:reach:email', 'ws:reach:both']);
  const where = await iv.handle(reach!.account, tap('ws:reach:both'));
  assert.match(bodyOf(where?.out[0]), /Where are you/);
  assert.deepEqual(where?.account.onboarding?.answers, {
    goals: ['sell'], what: 'Ankara fabric', price: 'About 30 USDC a piece', clients: 'find', own: 'ask', reach: 'both',
  });
});

test('a buyer is asked what they buy, not what they sell or charge', async () => {
  const { iv } = make();
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap('ws:goal:buy')))!.account;
  const asked = await iv.handle(a, tap('ws:goals:done'));
  assert.match(bodyOf(asked?.out[0]), /What do you usually buy or hire for/);
});

test('typing at a choice asks the same question again', async () => {
  const { iv } = make();
  const r = await iv.handle(at({ onboarding: { step: 'own', answers: { goals: ['work'] } } }), text('hmm'));
  assert.equal(r?.account.onboarding?.step, 'own');
  assert.deepEqual(idsOf(r?.out[0]), ['ws:own:offers', 'ws:own:ask']);
});

test('skip moves on to the next question without an answer', async () => {
  const { iv } = make();
  const r = await iv.handle(at({ onboarding: { step: 'what', answers: { goals: ['work'] } } }), text('skip'));
  assert.equal(r?.account.onboarding?.step, 'price');
  assert.equal(r?.account.onboarding?.answers?.what, undefined);
});

test('skip at the first question ends with no card and no hand-off', async () => {
  const { iv } = make();
  const r = await iv.handle(at({ onboarding: { step: 'goals', answers: { goals: [] } } }), text('Skip'));
  assert.equal(r?.account.onboarding?.step, 'done');
  assert.equal(r?.handOff, undefined);
  assert.match(bodyOf(r?.out[0]), /No problem/);
  assert.deepEqual(r?.out.at(-1), consent);
});

test('a place with no country is asked again', async () => {
  const { iv } = make();
  const r = await iv.handle(at({ onboarding: { step: 'where', answers: { goals: ['buy'] } } }), text('somewhere nice'));
  assert.equal(r?.account.onboarding?.step, 'where');
  assert.match(bodyOf(r?.out[0]), /didn't catch the country/);
});

test('the last message is the Here\'s your Karwan card, kept for the tap', async () => {
  const { iv, previewed } = make();
  const r = await toCard(iv);
  const card = r!.out.at(-1)!;
  assert.equal(card.kind, 'buttons');
  assert.match(bodyOf(card), /^\*Here's your Karwan\*/);
  assert.match(bodyOf(card), /\nYour agent offers Logo design\n/);
  const pending = Object.entries(r!.account.pendingActions ?? {});
  assert.equal(pending.length, 1);
  const [id, kept] = pending[0]!;
  assert.deepEqual(idsOf(card), [`confirm:${id}`, `cancel:${id}`]);
  assert.equal(kept.action.intent, 'save_setup');
  assert.equal(kept.expiresAt, 1_000 + 30 * 60_000);
  assert.equal(r!.account.onboarding?.step, 'confirm');
  assert.deepEqual(previewed.at(-1), {
    goals: ['work'], what: 'Logo design', price: '20 to 40 USDC, 3 days', clients: 'own', own: 'offers', reach: 'telegram', where: 'Lagos, Nigeria',
  });
});

test('a price the server cannot read is asked once more, then the card follows', async () => {
  let calls = 0;
  const { iv } = make({
    preview: async () => ({ lines: ['x'], needs: calls++ === 0 ? ['price'] : [] }),
  });
  const again = await toCard(iv);
  assert.equal(again?.account.onboarding?.step, 'price');
  assert.match(bodyOf(again?.out[0]), /couldn't read a price/);
  assert.equal(again?.account.onboarding?.answers?.retried, true);
  const card = await iv.handle(again!.account, text('30 USDC'));
  assert.equal(card?.account.onboarding?.step, 'confirm');
});

test('Looks right saves the card through the setup route, then offers to post the first offer', async () => {
  const { iv, saved } = make();
  const r = await toCard(iv);
  const id = Object.keys(r!.account.pendingActions!)[0]!;
  const done = await iv.handle(r!.account, tap(`confirm:${id}`));
  assert.equal(saved.length, 1);
  assert.equal(saved[0]!.intent, 'save_setup');
  assert.deepEqual(done?.account.pendingActions, {});
  assert.equal(done?.account.onboarding?.step, 'post');
  assert.match(bodyOf(done?.out[0]), /Saved/);
  assert.match(bodyOf(done?.out[1]), /Post this as your first offer/);
  assert.deepEqual(idsOf(done?.out[1]), ['ws:post:yes', 'ws:post:no']);

  const posted = await iv.handle(done!.account, tap('ws:post:yes'));
  assert.equal(posted?.handOff, 'I sell: Logo design. Usually 20 to 40 USDC, 3 days. Post this as my offer.');
  assert.equal(posted?.account.onboarding?.step, 'done');
  assert.deepEqual(posted?.out.at(-1), consent);

  const later = await iv.handle(done!.account, tap('ws:post:no'));
  assert.equal(later?.handOff, undefined);
  assert.equal(later?.account.onboarding?.step, 'done');
});

test('a save that fails keeps the card for another tap', async () => {
  const { iv } = make({ save: async () => ({ ok: false, message: "That didn't save. Tap Looks right again in a minute." }) });
  const r = await toCard(iv);
  const id = Object.keys(r!.account.pendingActions!)[0]!;
  const failed = await iv.handle(r!.account, tap(`confirm:${id}`));
  assert.equal(failed?.account.onboarding?.step, 'confirm');
  assert.ok(failed?.account.pendingActions?.[id]);
  assert.match(bodyOf(failed?.out[0]), /didn't save/);
});

test('Change something starts the questions again', async () => {
  const { iv, saved } = make();
  const r = await toCard(iv);
  const id = Object.keys(r!.account.pendingActions!)[0]!;
  const again = await iv.handle(r!.account, tap(`cancel:${id}`));
  assert.equal(saved.length, 0);
  assert.equal(again?.account.onboarding?.step, 'goals');
  assert.deepEqual(again?.account.pendingActions, {});
  assert.ok(idsOf(again?.out.at(-1)).includes('ws:goals:done'));
});

test('a buyer-only setup saves with no first-offer question', async () => {
  const { iv } = make();
  const a = at({
    onboarding: { step: 'where', answers: { goals: ['record'], places: 'Instagram', own: 'ask', reach: 'email' } },
  });
  const card = await iv.handle(a, text('Accra, Ghana'));
  const id = Object.keys(card!.account.pendingActions!)[0]!;
  const done = await iv.handle(card!.account, tap(`confirm:${id}`));
  assert.equal(done?.account.onboarding?.step, 'done');
  assert.deepEqual(done?.out.at(-1), consent);
});

test('an interview left at the old role question starts the new questions', async () => {
  const { iv } = make();
  const r = await iv.handle(at({ onboarding: { step: 'role' } }), text('hi'));
  assert.equal(r?.account.onboarding?.step, 'goals');
});

test('a step that is not the interview\'s is left alone', async () => {
  const { iv } = make();
  assert.equal(await iv.handle(at({ onboarding: { step: 'tag' } }), text('ada')), null);
  assert.equal(await iv.handle(at({ onboarding: { step: 'done' } }), text('hi')), null);
});

test('when the reading fails the last answer is asked for again, nothing is lost', async () => {
  const { iv } = make({ preview: async () => { throw new Error('down'); } });
  const a = at({ onboarding: { step: 'where', answers: { goals: ['record'], own: 'ask', reach: 'email' } } });
  const r = await iv.handle(a, text('Accra, Ghana'));
  assert.deepEqual(r?.account.onboarding, a.onboarding);
  assert.match(bodyOf(r?.out[0]), /couldn't read that just now/);
});

test('a message while the card waits shows it again, replacing the old one', async () => {
  const { iv } = make();
  const r = await toCard(iv);
  const first = Object.keys(r!.account.pendingActions!)[0]!;
  const again = await iv.handle(r!.account, text('what now?'));
  const ids = Object.keys(again!.account.pendingActions!);
  assert.equal(ids.length, 1);
  assert.notEqual(ids[0], first);
  assert.match(bodyOf(again?.out[0]), /^\*Here's your Karwan\*/);
});
