import assert from 'node:assert/strict';
import test from 'node:test';
import { greetingKey, groupConversations } from './conversationGroups';

/// The conversation column: Today, Yesterday, Earlier, newest first, and a
/// greeting that follows the local hour.
///
///   npx tsx --test features/assistant/conversationGroups.test.ts

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const now = at(2026, 10, 20, 15);

test('conversations fall under Today, Yesterday and Earlier by local day, newest first', () => {
  const list = [
    { id: 'a', title: 'a', createdAt: 0, updatedAt: at(2026, 10, 20, 9) },
    { id: 'b', title: 'b', createdAt: 0, updatedAt: at(2026, 10, 20, 14) },
    { id: 'c', title: 'c', createdAt: 0, updatedAt: at(2026, 10, 19, 23) },
    { id: 'd', title: 'd', createdAt: 0, updatedAt: at(2026, 10, 2) },
  ];
  assert.deepEqual(
    groupConversations(list, now).map((g) => [g.when, g.items.map((c) => c.id)]),
    [['today', ['b', 'a']], ['yesterday', ['c']], ['earlier', ['d']]],
  );
});

test('an empty group is left out', () => {
  const list = [{ id: 'x', title: 'x', createdAt: 0, updatedAt: at(2026, 9, 1) }];
  assert.deepEqual(groupConversations(list, now).map((g) => g.when), ['earlier']);
  assert.deepEqual(groupConversations([], now), []);
});

test('the greeting follows the hour', () => {
  assert.equal(greetingKey(5), 'morning');
  assert.equal(greetingKey(11), 'morning');
  assert.equal(greetingKey(12), 'afternoon');
  assert.equal(greetingKey(17), 'afternoon');
  assert.equal(greetingKey(18), 'evening');
  assert.equal(greetingKey(2), 'evening');
});
