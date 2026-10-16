import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { groupNotifications, mergeNotifications, plainSavedSummary } from './groupNotifications';

const n = (id: string, summary: string, read = true, type = 'wallet.credited', href = '/activity') => ({ id, jobId: '', type, summary, ts: Number(id), read, href });

test('the same note in a row becomes one row with a count, newest first', () => {
  const rows = groupNotifications([
    n('9', '20 USDC arrived in your balance.'),
    n('8', '20 USDC arrived in your balance.', false),
    n('7', '20 USDC arrived in your balance.'),
    n('6', '20 USDC arrived in your buying agent.'),
    n('5', '20 USDC arrived in your balance.'),
  ]);
  assert.deepEqual(rows.map((r) => [r.lead.id, r.count, r.read]), [['9', 3, false], ['6', 1, true], ['5', 1, true]]);
  assert.deepEqual(rows[0].ids, ['9', '8', '7']);
});

test('money notes fold on their words even though each opens its own receipt', () => {
  const rows = groupNotifications([n('3', '20 USDC arrived in your balance.', true, 'wallet.credited', '/activity?receipt=0x3'), n('2', '20 USDC arrived in your balance.', true, 'wallet.credited', '/activity?receipt=0x2')]);
  assert.deepEqual(rows.map((r) => [r.lead.href, r.count]), [['/activity?receipt=0x3', 2]]);
});

test('a fresh copy of a saved note brings its new words and keeps it read', () => {
  const saved = [{ ...n('5', '+20 USDC landed in your identity wallet.'), read: true }];
  const merged = mergeNotifications(saved, [{ ...n('5', '20 USDC arrived in your balance.'), read: false }, n('6', 'New one.', false)], 50);
  assert.deepEqual(merged.map((m) => [m.id, m.summary, m.read]), [['6', 'New one.', false], ['5', '20 USDC arrived in your balance.', true]]);
});

test('notes that open different places never fold together', () => {
  const rows = groupNotifications([n('2', 'Match found.', true, 'deal.matched', '/jobs/a'), n('1', 'Match found.', true, 'deal.matched', '/jobs/b')]);
  assert.equal(rows.length, 2);
});

test('the bell shows each group once, marks unread clearly and reads a group as one', () => {
  const bell = readFileSync(new URL('./components/NotificationBell.tsx', import.meta.url), 'utf8');
  assert.match(bell, /groupNotifications\(notifications\)/);
  assert.match(bell, /t\.timesTemplate/);
  assert.match(bell, /t\.unread/);
  assert.match(bell, /group\.ids\.forEach\(markRead\)|group\.ids\.forEach\(\(id\) => markRead\(id\)\)/);
});

test('a note saved in the old wording reads plainly when it loads', () => {
  assert.equal(plainSavedSummary('+20 USDC landed in your identity wallet.'), '20 USDC arrived in your balance.');
  assert.equal(plainSavedSummary('+20 USDC landed in your buyer agent wallet.'), '20 USDC arrived in your buying agent.');
  assert.equal(plainSavedSummary('+10 USDC landed in your seller agent wallet.'), '10 USDC arrived in your selling agent.');
  assert.equal(plainSavedSummary('+20 USDC landed in your wallet.'), '20 USDC arrived in your balance.');
  assert.equal(plainSavedSummary('-5 USDC left your identity wallet.'), '5 USDC left your balance.');
  assert.equal(plainSavedSummary('+3 USDC sont arrivés sur votre portefeuille.'), '3 USDC sont arrivés sur votre portefeuille.');
  assert.equal(plainSavedSummary('Match found.'), 'Match found.');
});
