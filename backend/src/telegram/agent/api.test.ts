import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelegramApi } from './api.js';

function fakeFetch(routes: Record<string, unknown>, calls: string[]) {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${u.replace(/bot[^/]+/, 'bot<token>')} ${init?.body ?? ''}`);
    const key = Object.keys(routes).find((k) => u.endsWith(k));
    const value = key ? routes[key] : undefined;
    if (value instanceof Uint8Array) return new Response(value);
    return new Response(JSON.stringify(value ?? { ok: false }), { status: value ? 200 : 400 });
  }) as typeof fetch;
}

test('a message is posted to the chat with its keyboard', async () => {
  const calls: string[] = [];
  const api = createTelegramApi({ token: 't', maxFileBytes: 100, fetch: fakeFetch({ '/sendMessage': { ok: true, result: {} } }, calls) });
  const ok = await api.sendMessage(4242, { text: 'Hi', link_preview_options: { is_disabled: true } });
  assert.equal(ok, true);
  assert.match(calls[0]!, /sendMessage \{"chat_id":4242,"text":"Hi"/);
});

test('a failed send is reported, not thrown', async () => {
  const api = createTelegramApi({ token: 't', maxFileBytes: 100, fetch: fakeFetch({}, []) });
  assert.equal(await api.sendMessage(1, { text: 'x', link_preview_options: { is_disabled: true } }), false);
});

test('a file is fetched through getFile, and one over the cap is refused before download', async () => {
  const calls: string[] = [];
  const bytes = new Uint8Array([1, 2, 3]);
  const small = createTelegramApi({
    token: 't',
    maxFileBytes: 100,
    fetch: fakeFetch({ '/getFile': { ok: true, result: { file_path: 'photos/a.jpg', file_size: 3 } }, '/photos/a.jpg': bytes }, calls),
  });
  assert.deepEqual(await small.download('f1'), bytes);

  const bigCalls: string[] = [];
  const big = createTelegramApi({
    token: 't',
    maxFileBytes: 100,
    fetch: fakeFetch({ '/getFile': { ok: true, result: { file_path: 'docs/b.pdf', file_size: 5_000 } } }, bigCalls),
  });
  assert.equal(await big.download('f2'), null);
  assert.equal(bigCalls.length, 1, 'nothing is downloaded past the cap');
});
