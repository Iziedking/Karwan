import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';

/// Keyed RPC URLs never reach a log line or an error message.
///
/// Alchemy, QuikNode and the Canteen node carry the API key in the URL path,
/// and viem prints the full URL in every HTTP error ("URL: ..."). Those errors
/// land in container logs, the admin error feed and the supervisor's LLM
/// diagnosis, so the key has to be gone before any of them see it.
///
///   npx tsx --test src/security/rpcUrlRedact.test.ts

const { rpcSecretUrls, redactRpcUrls, redactErrorUrls, redactingStream } = await import('./rpcUrlRedact.js');

const KEY = 'TESTKEYnotRealZZ0000000000';
const ALCHEMY = `https://arc-testnet.g.alchemy.com/v2/${KEY}`;
const QUIK = 'https://nameless-summer-pallet.arc-testnet.quiknode.pro/0123456789abcdef0123456789abcdef/';
const CANTEEN = 'https://rpc.testnet.arc-node.thecanteenapp.com/?token=sekrit-token-123';

const env = {
  ARC_TESTNET_RPC_URL: CANTEEN,
  ARC_TESTNET_RPC_URLS: `https://rpc-testnet.karwan.site, ${QUIK},${ALCHEMY}`,
  CRE_ARC_RPC_URL: 'https://rpc.karwan.site',
  ARC_WSS_URLS: 'wss://arc-testnet.example.com/ws/feedfacefeedfacefeedface',
  SESSION_SECRET: 'not-a-url',
  FRONTEND_BASE_URL: 'https://karwan.site/some/path',
};

test('every configured RPC or websocket URL that carries a path or query is a secret', () => {
  const urls = rpcSecretUrls(env);
  assert.ok(urls.includes(ALCHEMY));
  assert.ok(urls.includes(QUIK));
  assert.ok(urls.includes(CANTEEN));
  assert.ok(urls.includes('wss://arc-testnet.example.com/ws/feedfacefeedfacefeedface'));
  // A bare host has nothing to hide, and non-RPC settings are not touched.
  assert.equal(urls.includes('https://rpc.karwan.site'), false);
  assert.equal(urls.includes('https://karwan.site/some/path'), false);
});

test('a viem HTTP error keeps the host and loses the key', () => {
  const urls = rpcSecretUrls(env);
  const viem = `RPC Request failed.\n\nURL: ${ALCHEMY}\nRequest body: {"method":"eth_getLogs"}\n\nDetails: Monthly capacity limit exceeded.`;
  const out = redactRpcUrls(viem, urls);
  assert.equal(out.includes(KEY), false, out);
  assert.match(out, /URL: https:\/\/arc-testnet\.g\.alchemy\.com\n/);
  assert.match(out, /Monthly capacity limit exceeded/);
});

test('a URL without its trailing slash is still caught', () => {
  const urls = rpcSecretUrls(env);
  const out = redactRpcUrls(`URL: ${QUIK.slice(0, -1)} failed`, urls);
  assert.equal(out.includes('0123456789abcdef'), false, out);
});

test('the error object keeps its type and fields, with the key gone from message, url and cause', () => {
  const urls = rpcSecretUrls(env);
  class HttpRequestError extends Error {
    url = ALCHEMY;
    status = 429;
  }
  const inner = new HttpRequestError(`HTTP request failed.\nURL: ${ALCHEMY}`);
  const outer = new Error(`all endpoints failed\nURL: ${CANTEEN}`, { cause: inner });

  const same = redactErrorUrls(outer, urls);
  assert.equal(same, outer, 'the error was replaced');
  assert.equal(outer.message.includes('sekrit-token-123'), false, outer.message);
  assert.ok(inner instanceof HttpRequestError);
  assert.equal(inner.status, 429);
  assert.equal(inner.message.includes(KEY), false, inner.message);
  assert.equal(inner.url.includes(KEY), false, inner.url);
  assert.equal(inner.url, 'https://arc-testnet.g.alchemy.com');
});

test('a self-referencing cause chain does not loop', () => {
  const urls = rpcSecretUrls(env);
  const err = new Error(`URL: ${ALCHEMY}`) as Error & { cause?: unknown };
  err.cause = err;
  redactErrorUrls(err, urls);
  assert.equal(err.message.includes(KEY), false);
});

test('a log line written through the stream never carries a key', async () => {
  const urls = rpcSecretUrls(env);
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  const stream = redactingStream(sink, urls);
  const line = JSON.stringify({ level: 40, err: `URL: ${ALCHEMY}\nURL: ${CANTEEN}` }) + '\n';
  await new Promise<void>((resolve) => stream.write(line, () => resolve()));
  const out = lines.join('');
  assert.equal(out.includes(KEY), false, out);
  assert.equal(out.includes('sekrit-token-123'), false, out);
  assert.match(out, /arc-testnet\.g\.alchemy\.com/);
});

test('nothing configured means text passes through unchanged', () => {
  assert.equal(redactRpcUrls(`URL: ${ALCHEMY}`, []), `URL: ${ALCHEMY}`);
});
