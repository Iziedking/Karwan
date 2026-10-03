import assert from 'node:assert/strict';
import test from 'node:test';
import { updatesRoutes } from './updates.js';

test('the public updates list serves live cards without admin fields', async () => {
  const res = await updatesRoutes.request('/');
  assert.equal(res.status, 200);
  const body = (await res.json()) as { cards: Array<Record<string, unknown>>; trending: unknown[] };
  assert.ok(body.cards.length > 0);
  for (const card of body.cards) {
    assert.equal('active' in card, false);
    assert.equal('createdAt' in card, false);
    assert.match(String(card.href), /^(\/(?!\/)|https:\/\/)/);
  }
  assert.ok(Array.isArray(body.trending));
});
