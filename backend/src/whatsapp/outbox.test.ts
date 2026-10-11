import assert from 'node:assert/strict';
import test from 'node:test';
import { createOutbox, type OutboxDeps } from './outbox.js';
import type { OutMessage } from '../channels/render.js';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 11, 12);

function setup(opts: { lastInboundAt?: number | null; slots?: number; failWith?: number } = {}) {
  const posted: Array<Record<string, unknown>> = [];
  const queued: OutMessage[] = [];
  let slots = opts.slots ?? 10;
  const deps: OutboxDeps = {
    token: 'tkn',
    phoneNumberId: '123',
    graphVersion: 'v21.0',
    now: () => NOW,
    lastInboundAt: async () => (opts.lastInboundAt === undefined ? NOW - HOUR : opts.lastInboundAt),
    claimDailySlot: async () => (slots-- > 0),
    enqueue: async (_to, m) => {
      queued.push(m);
    },
    takeQueue: async () => queued.splice(0),
    fetch: (async (_url: string, init: RequestInit) => {
      posted.push(JSON.parse(String(init.body)));
      if (opts.failWith) return new Response('{"error":{"message":"bad"}}', { status: opts.failWith });
      return new Response('{"messages":[{"id":"wamid.out"}]}', { status: 200 });
    }) as unknown as typeof fetch,
  };
  return { outbox: createOutbox(deps), posted, queued };
}

const text: OutMessage = { kind: 'text', body: 'Your record is ready.' };

test('inside the 24-hour window text is posted as is', async () => {
  const { outbox, posted } = setup();
  assert.deepEqual(await outbox.send('2348012345678', text), { sent: true });
  assert.equal(posted[0].type, 'text');
  assert.deepEqual(posted[0].text, { body: 'Your record is ready.', preview_url: true });
  assert.equal(posted[0].to, '2348012345678');
});

test('buttons go out as an interactive reply-button message', async () => {
  const { outbox, posted } = setup();
  await outbox.send('1', { kind: 'buttons', body: 'Release?', buttons: [{ id: 'confirm:a', title: 'Confirm' }, { id: 'cancel:a', title: 'Cancel' }] });
  const i = posted[0].interactive as { type: string; action: { buttons: { reply: { id: string } }[] } };
  assert.equal(i.type, 'button');
  assert.deepEqual(i.action.buttons.map((b) => b.reply.id), ['confirm:a', 'cancel:a']);
});

test('outside the window the message is queued and a deal_update template nudges the person', async () => {
  const { outbox, posted, queued } = setup({ lastInboundAt: NOW - 25 * HOUR });
  assert.deepEqual(await outbox.send('1', text), { sent: false, queued: true });
  assert.equal(queued.length, 1);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, 'template');
  assert.equal((posted[0].template as { name: string }).name, 'deal_update');
});

test('a person who never wrote is outside the window', async () => {
  const { outbox, queued } = setup({ lastInboundAt: null });
  await outbox.send('1', text);
  assert.equal(queued.length, 1);
});

test('daily limit reached queues without sending anything', async () => {
  const { outbox, posted, queued } = setup({ lastInboundAt: NOW - 25 * HOUR, slots: 0 });
  assert.deepEqual(await outbox.send('1', text), { sent: false, queued: true });
  assert.equal(posted.length, 0);
  assert.equal(queued.length, 1);
});

test('template parameters carry no line breaks or tabs', async () => {
  const { outbox, posted } = setup();
  await outbox.send('1', { kind: 'template', name: 'match_found', params: ['line one\nline\ttwo'] });
  const params = (posted[0].template as { components: { parameters: { text: string }[] }[] }).components[0].parameters;
  assert.equal(params[0].text, 'line one line two');
});

test('a Graph API error returns sent false without throwing', async () => {
  const { outbox } = setup({ failWith: 400 });
  assert.deepEqual(await outbox.send('1', text), { sent: false });
});

test('drain sends queued messages in order once the person writes', async () => {
  const { outbox, posted, queued } = setup();
  queued.push({ kind: 'text', body: 'first' }, { kind: 'text', body: 'second' });
  await outbox.drain('1');
  assert.deepEqual(posted.map((p) => (p.text as { body: string }).body), ['first', 'second']);
  assert.equal(queued.length, 0);
});

test('without a token or number id nothing is posted', async () => {
  const posted: unknown[] = [];
  const outbox = createOutbox({
    token: undefined, phoneNumberId: undefined, graphVersion: 'v21.0', now: () => NOW,
    lastInboundAt: async () => NOW, claimDailySlot: async () => true, enqueue: async () => {}, takeQueue: async () => [],
    fetch: (async () => {
      posted.push(1);
      return new Response('{}');
    }) as unknown as typeof fetch,
  });
  assert.deepEqual(await outbox.send('1', text), { sent: false });
  assert.equal(posted.length, 0);
});
