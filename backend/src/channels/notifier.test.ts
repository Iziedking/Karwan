import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhatsappNotifier } from './notifier.js';
import type { OutMessage } from './render.js';

type Handler = (e: { type: string; jobId?: string }) => Promise<void>;

function setup(opts: { muted?: boolean } = {}) {
  let handler: Handler = async () => {};
  const told: Array<{ address: string; m: OutMessage }> = [];
  createWhatsappNotifier({
    subscribe: (h) => {
      handler = h as Handler;
      return () => {};
    },
    relevant: new Set(['deal.delivered', 'deal.release.blocked']),
    recipients: async () => [
      { address: '0xbuyer', role: 'buyer' },
      { address: '0xseller', role: 'seller' },
    ],
    summary: (e, role) => (role === 'buyer' ? { text: 'The check found a problem. Your money stays in `escrow`.', url: 'https://karwan.site/deals/1' } : null),
    muted: async () => !!opts.muted,
    tell: async (address, m) => {
      told.push({ address, m });
      return address === '0xbuyer';
    },
  });
  return { fire: (e: { type: string; jobId?: string }) => handler(e), told };
}

test('a relevant deal event reaches the chat account with its link, without code marks', async () => {
  const { fire, told } = setup();
  await fire({ type: 'deal.release.blocked', jobId: '1' });
  assert.equal(told.length, 1);
  assert.equal(told[0].address, '0xbuyer');
  const body = (told[0].m as { body: string }).body;
  assert.match(body, /money stays in escrow/);
  assert.doesNotMatch(body, /`/);
  assert.match(body, /karwan\.site\/deals\/1/);
});

test('events nobody asked for are ignored', async () => {
  const { fire, told } = setup();
  await fire({ type: 'agent.thinking' });
  assert.equal(told.length, 0);
});

test('a muted account gets nothing', async () => {
  const { fire, told } = setup({ muted: true });
  await fire({ type: 'deal.delivered', jobId: '1' });
  assert.equal(told.length, 0);
});
