import assert from 'node:assert/strict';
import test from 'node:test';
import { sourcedCards, __resetSourceCacheForTests } from './source.js';

const card = { id: 'upd_1', order: 0, kind: 'video', tag: 'Karwan', title: "Trader's Nightmare", body: '', ctaLabel: 'Watch', href: 'https://vimeo.com/1', ground: 'paper', art: 0 };
const respond = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('a mirror shows the cards published on its source', async () => {
  __resetSourceCacheForTests();
  const cards = await sourcedCards('https://mainnet-api.example', respond({ cards: [card], trending: [] }));
  assert.equal(cards?.[0]?.title, "Trader's Nightmare");
});

test('no source, a failing source or an unsafe card means use the local list', async () => {
  __resetSourceCacheForTests();
  assert.equal(await sourcedCards(undefined), null);
  assert.equal(await sourcedCards('https://down.example', respond({}, 502)), null);
  __resetSourceCacheForTests();
  assert.equal(await sourcedCards('https://bad.example', respond({ cards: [{ ...card, href: 'javascript:alert(1)' }] })), null);
});
