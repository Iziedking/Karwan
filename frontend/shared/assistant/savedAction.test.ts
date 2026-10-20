import assert from 'node:assert/strict';
import test from 'node:test';
import { savedAction } from './savedAction';

/// What a saved conversation keeps of a card: never its id or payload, and
/// "done" only for a card that ran.
///
///   npx tsx --test shared/assistant/savedAction.test.ts

const card = { kind: 'confirm' as const, id: 'send:1', intent: 'post_offer' as const, title: 'Post your offer', fields: [], payload: { x: 1 } };

test('a card that ran is saved as done, without its id or payload', () => {
  const saved = savedAction(card as never, () => ({ successText: 'ok' }));
  assert.deepEqual(saved, { kind: 'confirm', intent: 'post_offer', title: 'Post your offer', status: 'done' });
});

test('a card still running, dismissed or never tapped is not done', () => {
  for (const outcome of ['running', 'dismissed', undefined] as const) {
    assert.equal(savedAction(card as never, () => outcome)?.status, 'expired');
  }
});

test('navigate links are not kept, and a past card keeps its status', () => {
  assert.equal(savedAction({ kind: 'navigate', id: 'n', label: 'Open', href: '/x' }, () => undefined), null);
  assert.deepEqual(savedAction({ kind: 'confirm', title: 'Paid', status: 'done' }, () => undefined), { kind: 'confirm', title: 'Paid', label: undefined, status: 'done' });
});
