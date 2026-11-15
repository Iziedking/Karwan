import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { finishedTurn, keepFinishedTurn, streamTurn, wantsStream } from './assistantStream.js';
import type { AssistantTurnResult } from '../assistant/turn.js';
import type { TurnEvent } from '../assistant/turnEvents.js';

type Run = (onStep: (e: TurnEvent) => void) => Promise<AssistantTurnResult>;

function appFor(run: Run, keep: { address: string; turnId?: string } = { address: '0xa' }, opts?: { keepAliveMs?: number }) {
  const app = new Hono();
  app.post('/chat', (c) => streamTurn(c, run, keep, opts));
  return app;
}

/// The frames of an SSE body, in order: event name and data, comments kept as `:`.
function frames(body: string): Array<{ event: string; data: string }> {
  return body.split('\n\n').map((block) => block.trim()).filter(Boolean).map((block) => {
    if (block.startsWith(':')) return { event: ':', data: block.slice(1).trim() };
    const event = /^event: ?(.*)$/m.exec(block)?.[1] ?? 'message';
    const data = /^data: ?(.*)$/m.exec(block)?.[1] ?? '';
    return { event, data };
  });
}

test('status then done', async () => {
  const res = await appFor(async (onStep) => {
    onStep({ kind: 'status', tool: 'get_my_balance' });
    onStep({ kind: 'retrying' });
    return { ok: true, reply: 'Hi' };
  }).request('/chat', { method: 'POST' });
  const got = frames(await res.text()).filter((f) => f.event !== ':');
  assert.deepEqual(got, [
    { event: 'status', data: '{"tool":"get_my_balance"}' },
    { event: 'retrying', data: '{}' },
    { event: 'done', data: '{"reply":"Hi"}' },
  ]);
});

test('a finished turn with cards sends them in done', async () => {
  const actions = [{ kind: 'navigate', label: 'Open', href: '/deals' }] as unknown as NonNullable<Extract<AssistantTurnResult, { ok: true }>['actions']>;
  const res = await appFor(async () => ({ ok: true, reply: 'Here', actions })).request('/chat', { method: 'POST' });
  const done = frames(await res.text()).find((f) => f.event === 'done');
  assert.deepEqual(JSON.parse(done!.data), { reply: 'Here', actions });
});

test('a failed turn ends with an error frame', async () => {
  const res = await appFor(async () => ({ ok: false, status: 503, error: 'assistant-unavailable', code: 'assistant_state_unavailable' }))
    .request('/chat', { method: 'POST' });
  const last = frames(await res.text()).filter((f) => f.event !== ':').at(-1);
  assert.equal(last?.event, 'error');
  assert.deepEqual(JSON.parse(last!.data), { error: 'assistant-unavailable', code: 'assistant_state_unavailable' });
});

test('a throw ends with an error frame', async () => {
  const res = await appFor(async () => { throw new Error('boom'); }).request('/chat', { method: 'POST' });
  const last = frames(await res.text()).filter((f) => f.event !== ':').at(-1);
  assert.equal(last?.event, 'error');
  assert.deepEqual(JSON.parse(last!.data), { error: 'assistant-error' });
});

test('the stream is not buffered', async () => {
  const res = await appFor(async () => ({ ok: true, reply: 'Hi' })).request('/chat', { method: 'POST' });
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
  assert.equal(res.headers.get('cache-control'), 'no-cache, no-transform');
  assert.equal(res.headers.get('x-accel-buffering'), 'no');
  await res.text();
});

test('keep-alive while waiting', async () => {
  const res = await appFor(
    () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, reply: 'Hi' }), 90)),
    { address: '0xa' },
    { keepAliveMs: 20 },
  ).request('/chat', { method: 'POST' });
  const keepAlives = frames(await res.text()).filter((f) => f.event === ':' && f.data === 'keep-alive');
  assert.ok(keepAlives.length >= 2, `got ${keepAlives.length}`);
});

test('the finished turn is kept for its owner only', async () => {
  const res = await appFor(async () => ({ ok: true, reply: 'Kept' }), { address: '0xA', turnId: 'abcdefgh' }).request('/chat', { method: 'POST' });
  await res.text();
  assert.deepEqual(finishedTurn('0xa', 'abcdefgh'), { ok: true, reply: 'Kept' });
  assert.equal(finishedTurn('0xb', 'abcdefgh'), null);
});

test('a kept turn is gone after two minutes', () => {
  keepFinishedTurn('0xc', 'zzzzzzzz', { ok: true, reply: 'Old' }, 1_000);
  assert.deepEqual(finishedTurn('0xc', 'zzzzzzzz', 1_000 + 119_000), { ok: true, reply: 'Old' });
  assert.equal(finishedTurn('0xc', 'zzzzzzzz', 1_000 + 121_000), null);
});

test('wantsStream reads the Accept header', () => {
  assert.equal(wantsStream('text/event-stream'), true);
  assert.equal(wantsStream('application/json, text/event-stream'), true);
  assert.equal(wantsStream(undefined), false);
  assert.equal(wantsStream('application/json'), false);
});
