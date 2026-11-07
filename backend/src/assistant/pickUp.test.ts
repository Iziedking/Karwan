import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantConversation } from '../db/assistantConversations.js';
import { pickUpPreamble, unfinishedWork, type HeldCounts } from './pickUp.js';
import { createAssistantPickUpRoutes } from '../routes/assistantPickUp.js';

const NOW = Date.UTC(2026, 10, 7, 18);
const NONE: HeldCounts = { sent: 0, offer: 0, delivery: 0, request: 0, entry: 0 };

const conv = (last: AssistantConversation['messages'][number], over: Partial<AssistantConversation> = {}): AssistantConversation => ({
  id: 'c1',
  address: '0xada',
  title: 'I want to sell my old laptop',
  messages: [{ role: 'user', content: 'I want to sell my old laptop' }, last],
  createdAt: NOW - 10 * 3_600_000,
  updatedAt: NOW - 9 * 3_600_000,
  source: 'telegram',
  ...over,
});

test('a card shown and never confirmed is unfinished', () => {
  const p = unfinishedWork(
    conv({ role: 'assistant', content: 'Here is the listing.', actions: [{ kind: 'confirm', title: 'Post this offer', summary: 'HP Envy laptop, 270 USDC', status: 'expired' }] }),
    NONE,
    NOW,
  );
  assert.equal(p?.card, 'Post this offer: HP Envy laptop, 270 USDC');
  assert.equal(p?.source, 'telegram');
});

test('a confirmed card, a closed answer and nothing held leave nothing to pick up', () => {
  assert.equal(unfinishedWork(conv({ role: 'assistant', content: 'Posted.', actions: [{ kind: 'confirm', title: 'Post this offer', status: 'done' }] }), NONE, NOW), null);
  assert.equal(unfinishedWork(conv({ role: 'assistant', content: 'Your offer is live.' }), NONE, NOW), null);
  assert.equal(unfinishedWork(null, { ...NONE, offer: 2 }, NOW), null);
});

test('an unanswered question, or files still held, are unfinished', () => {
  const asked = unfinishedWork(conv({ role: 'assistant', content: 'Great. What is your asking price in USDC?' }), NONE, NOW);
  assert.equal(asked?.question, 'What is your asking price in USDC?');
  const held = unfinishedWork(conv({ role: 'assistant', content: 'Done.' }), { ...NONE, offer: 1 }, NOW);
  assert.equal(held?.held.offer, 1);
});

test('work older than two weeks is not brought up', () => {
  assert.equal(unfinishedWork(conv({ role: 'assistant', content: 'Price?' }, { updatedAt: NOW - 15 * 24 * 3_600_000 }), NONE, NOW), null);
});

test('the preamble states only facts, and asks for one line', () => {
  const p = unfinishedWork(
    conv({ role: 'assistant', content: 'Here it is.', actions: [{ kind: 'confirm', title: 'Post this offer', summary: 'HP Envy, 270 USDC', status: 'expired' }] }),
    { ...NONE, offer: 1, sent: 1 },
    NOW,
  )!;
  const text = pickUpPreamble(p, NOW);
  assert.match(text, /ONE short line/);
  assert.match(text, /on Telegram, was 9 hours ago/);
  assert.match(text, /never confirmed: "Post this offer: HP Envy, 270 USDC"/);
  assert.match(text, /1 photo held for their next offer/);
  assert.match(text, /1 file they sent/);
});

test('the pick-up route needs a session, memory on, and a break of six hours', async () => {
  const pick = unfinishedWork(conv({ role: 'assistant', content: 'Price?' }), NONE, NOW)!;
  const routes = (address: string | null, memory: boolean, at = pick) =>
    createAssistantPickUpRoutes({ sessionAddress: () => address, memoryOn: async () => memory, read: async () => at, now: () => NOW });
  assert.equal((await routes(null, true).request('/')).status, 401);
  assert.deepEqual(await (await routes('0xADA', false).request('/')).json(), { pickUp: null });
  assert.equal(((await (await routes('0xada', true).request('/')).json()) as { pickUp: { question: string } }).pickUp.question, 'Price?');
  const recent = { ...pick, at: NOW - 3_600_000 };
  assert.deepEqual(await (await routes('0xada', true, recent).request('/')).json(), { pickUp: null });
});
