import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// The sweep's door, exercised through the real Hono route.
///
/// Testing `addSignal` proves the store works. It does not prove the token is
/// checked, that a caller cannot claim to be a Karwan release, or that the
/// endpoint refuses when no token is configured. Those are route behaviours and
/// they are the whole reason this endpoint is separate from the admin one.
///
///   npx tsx --test src/routes/signalIngest.test.ts

assert.equal(
  process.env.DATABASE_URL,
  undefined,
  'refusing to run: DATABASE_URL is set, which would run this against a real database',
);

const TOKEN = 'test-sweep-token-0123456789';
process.env.SIGNAL_INGEST_TOKEN = TOKEN;

// Its own store, for the same reason as the other suite: files get their own
// process but share a filesystem.
const STORE_PATH = join(tmpdir(), `karwan-ingest-store-${process.pid}.json`);
process.env.SIGNALS_STORE_PATH = STORE_PATH;

const { signalIngestRoutes } = await import('./signalIngest.js');
const { listSignals } = await import('../db/signals.js');

beforeEach(() => {
  if (existsSync(STORE_PATH)) rmSync(STORE_PATH);
});

after(() => {
  if (existsSync(STORE_PATH)) rmSync(STORE_PATH);
});

/// Each test gets its own client ip so the rate limiter's buckets do not leak
/// between them. Without this the later tests fail with 429 and the failure
/// looks like a bug in whatever they were actually checking.
function post(body: unknown, opts: { token?: string | null; ip?: string } = {}) {
  const token = opts.token === undefined ? TOKEN : opts.token;
  return signalIngestRoutes.request('/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': opts.ip ?? '10.0.0.1',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const ONE = {
  origin: 'arc' as const,
  source: 'Arc docs',
  title: 'Gateway lands on Arc',
  url: 'https://docs.arc.network/app-kit/unified-balance',
  myTake: 'This is the unified balance we already route through.',
};

test('a valid token appends to the pipeline', async () => {
  const res = await post({ signals: [ONE] }, { ip: '10.0.0.10' });
  assert.equal(res.status, 200);

  const body = (await res.json()) as { added: number; duplicate: number };
  assert.equal(body.added, 1);
  assert.equal(body.duplicate, 0);

  const stored = await listSignals();
  assert.equal(stored.length, 1);
  assert.equal(stored[0]!.origin, 'arc');
  assert.equal(stored[0]!.myTake, ONE.myTake);
});

test('no token, a wrong token and a truncated token are all refused', async () => {
  for (const token of [null, 'wrong', TOKEN.slice(0, -1), `${TOKEN}x`]) {
    const res = await post({ signals: [ONE] }, { token, ip: '10.0.0.20' });
    assert.equal(res.status, 401, `token ${JSON.stringify(token)} was accepted`);
  }
  assert.equal((await listSignals()).length, 0, 'a refused request still wrote');
});

test('the sweep cannot speak as a Karwan release', async () => {
  // `karwan` is the one origin a reader treats as our own word, and it belongs
  // to the watcher reading a file that shipped inside the image.
  const res = await post({ signals: [{ ...ONE, origin: 'karwan' }] }, { ip: '10.0.0.30' });
  assert.equal(res.status, 400);
  assert.equal((await listSignals()).length, 0);
});

test('re-running the sweep adds nothing the second time', async () => {
  await post({ signals: [ONE] }, { ip: '10.0.0.40' });
  const res = await post({ signals: [ONE] }, { ip: '10.0.0.40' });

  const body = (await res.json()) as { added: number; duplicate: number };
  assert.equal(body.added, 0);
  assert.equal(body.duplicate, 1);
  assert.equal((await listSignals()).length, 1);
});

test('a batch is capped and a malformed item rejects the whole batch', async () => {
  const ip = '10.0.0.50';
  const many = Array.from({ length: 51 }, (_, i) => ({ ...ONE, url: `https://e.com/${i}` }));
  assert.equal((await post({ signals: many }, { ip })).status, 400);

  // All or nothing. A batch that half-applied would leave the sweep unable to
  // tell what it still needs to send.
  const mixed = [ONE, { ...ONE, title: '', url: 'https://e.com/2' }];
  assert.equal((await post({ signals: mixed }, { ip })).status, 400);
  assert.equal((await listSignals()).length, 0);

  assert.equal((await post({ signals: [] }, { ip })).status, 400);
});

test('a runaway sweep is throttled rather than allowed to fill the table', async () => {
  const ip = '10.0.0.60';
  const codes: number[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await post({ signals: [{ ...ONE, url: `https://e.com/burst/${i}` }] }, { ip });
    codes.push(res.status);
  }

  assert.equal(codes[0], 200, 'the first call was throttled');
  assert.ok(codes.includes(429), 'the limit never fired');
  // The limit is 10 a minute, so the table cannot have taken all twelve.
  assert.ok((await listSignals()).length <= 10);
});
