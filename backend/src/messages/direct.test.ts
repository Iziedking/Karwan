import assert from 'node:assert/strict';
import test from 'node:test';
import { mayMessage, pairKey, warningFor, type SenderHistory } from './direct.js';

/// Who may message whom by tag before a deal, and when a message carries the
/// escrow warning.
///
///   npx tsx --test src/messages/direct.test.ts

const HOUR = 60 * 60 * 1000;
const NOW = 1_760_000_000_000;
const none: SenderHistory = { firstMessages: [] };

test('you cannot message yourself', () => {
  assert.deepEqual(mayMessage({ from: '0xADA', to: '0xada', history: none, now: NOW }), { ok: false, reason: 'self' });
});

test('a tag that resolves to no one is refused', () => {
  assert.deepEqual(mayMessage({ from: '0xada', to: null, history: none, now: NOW }), { ok: false, reason: 'unknown_tag' });
});

test('five unanswered first messages pause the sender for a day', () => {
  const firstMessages = ['0x1', '0x2', '0x3', '0x4', '0x5'].map((to, i) => ({ to, at: NOW - (5 - i) * HOUR, answered: false }));
  const r = mayMessage({ from: '0xada', to: '0x6', history: { firstMessages }, now: NOW });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'paused');
  assert.equal(!r.ok && r.until, NOW - 5 * HOUR + 24 * HOUR);
  const fourOnly = { firstMessages: firstMessages.slice(1) };
  assert.deepEqual(mayMessage({ from: '0xada', to: '0x6', history: fourOnly, now: NOW }), { ok: true });
  assert.deepEqual(mayMessage({ from: '0xada', to: '0x6', history: { firstMessages }, now: NOW + 20 * HOUR }), { ok: true });
});

test('a conversation that was answered never counts toward the pause', () => {
  const firstMessages = ['0x1', '0x2', '0x3', '0x4', '0x5'].map((to, i) => ({ to, at: NOW - i * HOUR, answered: i === 0 }));
  assert.deepEqual(mayMessage({ from: '0xada', to: '0x6', history: { firstMessages }, now: NOW }), { ok: true });
});

test('a paused sender can still write to someone who already answered them', () => {
  const firstMessages = ['0x1', '0x2', '0x3', '0x4', '0x5'].map((to) => ({ to, at: NOW - HOUR, answered: false }));
  const talked = { firstMessages: [...firstMessages, { to: '0x9', at: NOW - 2 * HOUR, answered: true }] };
  assert.deepEqual(mayMessage({ from: '0xada', to: '0x9', history: talked, now: NOW }), { ok: true });
});

test('a payment link before a deal gets the escrow warning', () => {
  const warn = 'Keep payment in Karwan escrow. Never pay outside it.';
  assert.equal(warningFor('Pay me at https://pay.example.com/ada', false), warn);
  assert.equal(warningFor('Call me on 0803 123 4567', false), warn);
  assert.equal(warningFor('Email ada@example.com', false), warn);
  assert.equal(warningFor('Pay me at https://pay.example.com/ada', true), null);
  assert.equal(warningFor('Two owambe outfits for 150 USDC, ready in 5 days', false), null);
});

test('the same pair gives the same key in either order', () => {
  assert.equal(pairKey('0xBBB', '0xaaa'), 'dm:0xaaa:0xbbb');
  assert.equal(pairKey('0xaaa', '0xbbb'), pairKey('0xbbb', '0xAAA'));
});
