import assert from 'node:assert/strict';
import test from 'node:test';
import { checkKarwanTag } from '../profile/karwanTag.js';
import { createTagStep } from './tagStep.js';
import type { ChatAccount, InboundMessage } from './types.js';

/// Picking a Karwan tag in chat, suggested from the Telegram username.
///
///   npx tsx --test src/channels/tagStep.test.ts

type Acct = ChatAccount & { tgUsername?: string | null };

const at = (over: Partial<Acct> = {}): Acct => ({
  numberHash: 'h1', to: 'tg:1', address: '0xabc', termsVersion: 'x', termsAt: 1, lastInboundAt: null, activated: true,
  onboarding: { step: 'tag' }, ...over,
});
const text = (t: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'text', text: t });
const tap = (replyId: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'button', replyId });

function setup(taken: string[] = []) {
  const claimed: string[] = [];
  const step = createTagStep<Acct>({
    check: checkKarwanTag,
    available: async (tag) => !taken.includes(tag),
    signup: async (_address, tag) => {
      if (taken.includes(tag)) return { ok: false, code: 'tag_taken' };
      claimed.push(tag);
      return { ok: true };
    },
    afterTag: async (account) => ({ account: { ...account, onboarding: { step: 'role' } }, out: [{ kind: 'text', body: 'Next.' }] }),
  });
  return { step, claimed };
}

test('a valid free Telegram username is suggested lowercased', async () => {
  const { step } = setup();
  assert.equal(await step.suggest('Ada_Shop', '0xabc'), 'ada_shop');
});

test('a username that breaks the tag rules is not suggested', async () => {
  const { step } = setup();
  assert.equal(await step.suggest('9ada', '0xabc'), null);
  assert.equal(await step.suggest('ada__x', '0xabc'), null);
  assert.equal(await step.suggest('ab', '0xabc'), null);
  assert.equal(await step.suggest('karwan_ada', '0xabc'), null);
  assert.equal(await step.suggest(null, '0xabc'), null);
});

test('a taken username is not suggested', async () => {
  const { step } = setup(['ada']);
  assert.equal(await step.suggest('ada', '0xabc'), null);
});

test('entering the step offers the suggestion as a button', async () => {
  const { step } = setup();
  const r = await step.enter(at({ tgUsername: 'ada', onboarding: { step: 'terms' } }));
  assert.equal(r.account.onboarding?.step, 'tag');
  const out = r.out[0]!;
  assert.equal(out.kind, 'buttons');
  assert.deepEqual(out.kind === 'buttons' ? out.buttons : [], [{ id: 'tag:take', title: 'Use @ada' }]);
});

test('with no suggestion the person is asked to type one', async () => {
  const { step } = setup();
  const r = await step.enter(at({ tgUsername: '9ada' }));
  const out = r.out[0]!;
  assert.equal(out.kind, 'text');
  assert.match(out.kind === 'text' ? out.body : '', /Type the tag you want/);
});

test('taking the suggestion claims it and moves on', async () => {
  const { step, claimed } = setup();
  const r = await step.handle(at({ tgUsername: 'ada' }), tap('tag:take'));
  assert.deepEqual(claimed, ['ada']);
  assert.equal(r?.account.onboarding?.step, 'role');
});

test('a typed tag is claimed after the same rules', async () => {
  const { step, claimed } = setup();
  await step.handle(at(), text('@Ada_Builds'));
  assert.deepEqual(claimed, ['ada_builds']);
});

test('a taken tag says so and stays on the tag step', async () => {
  const { step } = setup(['ada']);
  const r = await step.handle(at(), text('ada'));
  assert.equal(r?.account.onboarding?.step, 'tag');
  assert.match(r?.out[0] && 'body' in r.out[0] ? r.out[0].body : '', /taken/);
});

test('an invalid tag gets the rule', async () => {
  const { step } = setup();
  const r = await step.handle(at(), text('9 lives'));
  assert.match(r?.out[0] && 'body' in r.out[0] ? r.out[0].body : '', /3 to 20 letters/);
});

test('a message on another step is not this step\'s', async () => {
  const { step } = setup();
  assert.equal(await step.handle(at({ onboarding: { step: 'role' } }), text('ada')), null);
});
