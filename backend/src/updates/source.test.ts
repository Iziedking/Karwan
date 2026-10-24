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

test('a picture uploaded on the source is loaded from the source', async () => {
  __resetSourceCacheForTests();
  const cards = await sourcedCards('https://mainnet-api.example/', respond({ cards: [
    { ...card, id: 'upd_2', image: '/api/updates/images/0123456789abcdef01234567.webp' },
    { ...card, id: 'upd_3', image: '/media/updates/arc.webp' },
  ] }));
  assert.equal(cards?.[0]?.image, 'https://mainnet-api.example/api/updates/images/0123456789abcdef01234567.webp');
  assert.equal(cards?.[1]?.image, '/media/updates/arc.webp');
});
