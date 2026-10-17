import assert from 'node:assert/strict';
import test from 'node:test';
import { createInterview } from './interview.js';
import type { OutMessage } from './render.js';
import type { ChatAccount, InboundMessage } from './types.js';

/// Three plain questions set up the workspace and end in a first offer or
/// request, posted by the agent in the person's own words.
///
///   npx tsx --test src/channels/interview.test.ts

const at = (over: Partial<ChatAccount> = {}): ChatAccount => ({
  numberHash: 'h1', to: 'tg:1', address: '0xabc', termsVersion: 'x', termsAt: 1, lastInboundAt: null, activated: true, ...over,
});
const text = (t: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'text', text: t });
const tap = (replyId: string): InboundMessage => ({ id: 'm', from: 'tg:1', timestamp: 1, kind: 'button', replyId });
const bodyOf = (m: OutMessage | undefined) => (m && 'body' in m ? m.body : '');
const consent: OutMessage = { kind: 'text', body: 'Consent?' };

const iv = createInterview<ChatAccount>({ afterwards: [consent] });

async function walk(role: string, offer: string, price: string) {
  let a = (await iv.enter(at())).account;
  a = (await iv.handle(a, tap(role)))!.account;
  a = (await iv.handle(a, text(offer)))!.account;
  return iv.handle(a, text(price));
}

test('entering asks whether they sell, buy or both', async () => {
  const r = await iv.enter(at());
  assert.equal(r.account.onboarding?.step, 'role');
  const out = r.out[0]!;
  assert.deepEqual(out.kind === 'buttons' ? out.buttons.map((b) => b.id) : [], ['ws:sell', 'ws:buy', 'ws:both']);
});

test('a seller ends with a hand-off that asks to post an offer in their own words', async () => {
  const r = await walk('ws:sell', 'Logos and brand kits', '50 to 80 USDC, 3 days');
  assert.equal(r?.handOff, 'I sell: Logos and brand kits. Usually 50 to 80 USDC, 3 days. Post this as my offer.');
  assert.equal(r?.account.onboarding?.step, 'done');
  assert.equal(bodyOf(r?.out[0]), "Got it. Here's your offer to check.");
  assert.deepEqual(r?.out.at(-1), consent);
});

test('a buyer ends with a hand-off that asks to post a request', async () => {
  const r = await walk('ws:buy', 'A website for my shop', '300 USDC, two weeks');
  assert.equal(r?.handOff, 'I need: A website for my shop. My budget and timing: 300 USDC, two weeks. Post this as my request.');
  assert.equal(bodyOf(r?.out[0]), "Got it. Here's your request to check.");
});

test('the offer question matches the role', async () => {
  let a = (await iv.enter(at())).account;
  const asked = await iv.handle(a, tap('ws:buy'));
  assert.match(bodyOf(asked?.out[0]), /What do you need/);
  a = (await iv.enter(at())).account;
  assert.match(bodyOf((await iv.handle(a, tap('ws:both')))?.out[0]), /What do you sell/);
});

test('skip at any question finishes with no hand-off', async () => {
  for (const step of ['role', 'offer', 'price'] as const) {
    const r = await iv.handle(at({ onboarding: { step, role: 'sell', offer: 'x' } }), text('Skip'));
    assert.equal(r?.handOff, undefined);
    assert.equal(r?.account.onboarding?.step, 'done');
    assert.match(bodyOf(r?.out[0]), /No problem/);
  }
});

test('typing at the role question asks again with the buttons', async () => {
  const r = await iv.handle(at({ onboarding: { step: 'role' } }), text('hmm'));
  assert.equal(r?.account.onboarding?.step, 'role');
  assert.equal(r?.out[0]?.kind, 'buttons');
});

test('a step that is not the interview\'s is left alone', async () => {
  assert.equal(await iv.handle(at({ onboarding: { step: 'tag' } }), text('ada')), null);
});
