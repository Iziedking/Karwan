import assert from 'node:assert/strict';
import test from 'node:test';
import { assessGrounding } from './grounding.js';
import { replyStands, retryWithRead } from './turnRules.js';

/// The testnet conversation of 1 Nov 2026 that made two payment links and
/// then handed the person to the team.
const conversation = [
  { role: 'user' as const, content: 'Request a payment' },
  { role: 'assistant' as const, content: 'How much do you want to request? What is it for?' },
  { role: 'user' as const, content: '10 usdc for groceries' },
];
const madeLink = [{ toolResults: [{ toolName: 'create_payment_link', output: { ok: true, url: 'https://testnet.karwan.site/pay/x', amountUsdc: '10' } }] }];
const reply = 'Your payment link for 10 USDC is ready: https://testnet.karwan.site/pay/x';

test('"Request a payment" is a payment link, so the link it made grounds the reply', () => {
  const g = assessGrounding(conversation, madeLink);
  assert.equal(g.grounded, true);
  assert.deepEqual(g.acted, ['create_payment_link']);
});

test('a try that already made something is never run again, so nothing is made twice', () => {
  const first = { text: reply, hasActions: true, proposal: false, acted: 1, needsLiveState: true, grounded: false, subjects: 1 };
  assert.equal(retryWithRead(first), false);
  assert.equal(replyStands(first), true);
});

test('a reply that claims account facts without a read or an action still gets one read', () => {
  const unread = { text: 'Your balance is 40 USDC.', hasActions: false, proposal: false, acted: 0, needsLiveState: true, grounded: false, subjects: 1 };
  assert.equal(retryWithRead(unread), true);
  assert.equal(replyStands(unread), false);
});

test('a silent stateful try is retried once; a card or a question needs no retry', () => {
  const base = { hasActions: false, proposal: false, acted: 0, needsLiveState: true, grounded: false, subjects: 1 };
  assert.equal(retryWithRead({ ...base, text: '' }), true);
  assert.equal(retryWithRead({ ...base, text: '', hasActions: true, proposal: true }), false);
  assert.equal(replyStands({ ...base, text: '', hasActions: true, proposal: true }), true);
  assert.equal(retryWithRead({ ...base, text: 'How much should it be?' }), false);
});

test('request wording with an article still reads as a payment link, not a market request', () => {
  const link = [{ toolResults: [{ toolName: 'create_payment_link', output: { ok: true, url: 'u' } }] }];
  for (const text of ['request a payment', 'Request a payment of 20 usdc', 'request an amount from my client', 'request 10 usdc']) {
    assert.equal(assessGrounding([{ role: 'user', content: text }], link).grounded, true, text);
  }
  const market = [{ toolResults: [{ toolName: 'get_my_market_activity', output: { requests: [] } }] }];
  assert.equal(assessGrounding([{ role: 'user', content: 'show my requests' }], market).grounded, true);
});

test('only tools that change something count as acting, and only when they worked', () => {
  const steps = (toolName: string, output: unknown) => [{ toolResults: [{ toolName, output }] }];
  assert.deepEqual(assessGrounding(conversation, steps('create_payment_link', { error: 'offline' })).acted, []);
  assert.deepEqual(assessGrounding(conversation, steps('get_my_balance', { wallet: {} })).acted, []);
  assert.deepEqual(assessGrounding(conversation, steps('rate_deal', { ok: true })).acted, ['rate_deal']);
});
