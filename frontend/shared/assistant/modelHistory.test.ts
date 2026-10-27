import assert from 'node:assert/strict';
import test from 'node:test';
import { contentForModel } from './modelHistory';

/// The assistant only sees words, so a card it showed is described to it on
/// the next turn: what it held and whether it ran.
///
///   npx tsx --test shared/assistant/modelHistory.test.ts

const card = {
  kind: 'confirm' as const, id: 'post_request:1', intent: 'post_request' as const, title: 'Post this request',
  fields: [{ label: 'Budget', value: '120 USDC' }, { label: 'Due', value: 'in 3 days' }], payload: { budgetUsdc: 120 },
};
const reply = 'Review the proposed actions below. Nothing has been executed.';

test('a card not yet confirmed is described with its rows, never its payload', () => {
  const out = contentForModel({ role: 'assistant', content: reply, actions: [card as never] }, () => false);
  assert.equal(out, `${reply}\n\nCard shown, not confirmed: Post this request. Budget: 120 USDC. Due: in 3 days.`);
  assert.equal(out.includes('budgetUsdc'), false);
});

test('a card that ran says so, and a saved card keeps what it showed', () => {
  assert.match(contentForModel({ role: 'assistant', content: reply, actions: [card as never] }, () => true), /Card confirmed: Post this request\./);
  const saved = { kind: 'confirm', title: 'Post this request', fields: [{ label: 'Budget', value: '120 USDC' }], status: 'expired' as const };
  assert.match(contentForModel({ role: 'assistant', content: reply, actions: [saved] }, () => false), /not confirmed: Post this request\. Budget: 120 USDC\./);
});

test('people, links and plain replies pass through unchanged, within the length the server takes', () => {
  assert.equal(contentForModel({ role: 'user', content: 'make the deadline 10 days' }, () => false), 'make the deadline 10 days');
  const link = { kind: 'navigate' as const, id: 'n', label: 'Open', href: '/x' };
  assert.equal(contentForModel({ role: 'assistant', content: 'Here.', actions: [link as never] }, () => false), 'Here.');
  const long = { ...card, fields: Array.from({ length: 200 }, (_, i) => ({ label: `Row ${i}`, value: 'x'.repeat(40) })) };
  assert.ok(contentForModel({ role: 'assistant', content: reply, actions: [long as never] }, () => false).length <= 4000);
});
