import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import type { Address, Hex } from 'viem';
import { memoryContestsStore } from '../db/contests.js';
import { createContests } from '../contests/contests.js';
import type { EntryFile } from '../contests/entryFiles.js';
import { createContestRoutes } from './contests.js';

/// The contest routes (view 40): a party sees only what is theirs to see.

const BUYER: Address = '0x1111111111111111111111111111111111111111';
const S1: Address = '0x3333333333333333333333333333333333333333';
const S2: Address = '0x4444444444444444444444444444444444444444';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);
const dataUrl = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`;
const DAY = 86_400_000;

function setup() {
  let now = 1_800_000_000_000;
  let n = 0;
  let who: string | null = null;
  const store = memoryContestsStore();
  const saved = new Map<string, EntryFile[]>();
  const core = createContests({
    store,
    saveEntryFiles: (id, files) => { saved.set(id, files); },
    savePreview: () => {},
    openingConfig: async () => ({ open: true, feeBps: 100, perDealCap: 1_005_000_000n }),
    buyerAgentFor: async (b) => (b.toLowerCase() === BUYER ? { walletId: 'wb', address: '0x2222222222222222222222222222222222222222' } : null),
    sellerAgentFor: async (s) => ({ walletId: `w${s}`, address: (`0xa${s.slice(3)}`) as Address }),
    identityOf: async () => 0n,
    balanceOf: async () => 1_000_000_000n,
    guard: async () => ({ ok: true }),
    chain: {
      open: async () => ({ jobId: 1n, txHash: '0x01' as Hex }),
      enter: async () => '0x02' as Hex,
      award: async () => '0x03' as Hex,
      cancel: async () => ({ txHash: '0x04' as Hex, back: 0n }),
      giveBack: async () => ({ txHash: '0x05' as Hex, back: 0n }),
    },
    tell: () => {},
    now: () => now,
    newId: (p) => `${p}_${++n}`,
  });
  const app = new Hono();
  app.route('/api/contests', createContestRoutes({
    core, store,
    readFile: (id, i) => saved.get(id)?.[i] ?? null,
    readPreview: () => ({ bytes: PNG, contentType: 'image/png' }),
    takeHeldFiles: () => [],
    feeBps: async () => 100,
    session: () => (who ? { address: who } : null),
    nameOf: async (a) => (a.toLowerCase() === S1 ? 'Ada' : 'Tunde'),
  }));
  const as = (a: string | null) => { who = a; };
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`/api/contests${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { call, as, advance: (ms: number) => (now += ms) };
}

const post = { title: 'Best logo', brief: 'A logo for a bakery', prizeUsdc: '300', places: 2, entriesDays: 7 };

async function contestWithEntry() {
  const s = setup();
  s.as(BUYER);
  const c = (await (await s.call('POST', '', post)).json()) as { contest: { id: string } };
  s.as(S1);
  const e = (await (await s.call('POST', `/${c.contest.id}/entries`, { files: [dataUrl], note: 'mine' })).json()) as { entry: { id: string } };
  return { ...s, id: c.contest.id, entryId: e.entry.id };
}

test('posting and entering need a signed-in person', async () => {
  const s = setup();
  assert.equal((await s.call('POST', '', post)).status, 401);
  s.as(BUYER);
  assert.equal((await s.call('POST', '/draft', post)).status, 200);
});

test('the market lists open contests without anyone’s entries', async () => {
  const { call, as, id } = await contestWithEntry();
  as(null);
  const list = (await (await call('GET', '')).json()) as { contests: Array<Record<string, unknown>> };
  assert.equal(list.contests.length, 1);
  assert.equal(list.contests[0]!.entries, 1);
  const page = (await (await call('GET', `/${id}`)).json()) as Record<string, unknown>;
  assert.equal(page.entryList, undefined, 'a stranger sees no entries');
});

test('the buyer sees each entry’s preview and note; another seller sees only their own', async () => {
  const { call, as, id, entryId } = await contestWithEntry();
  as(BUYER);
  const mine = (await (await call('GET', `/${id}`)).json()) as { entryList: Array<{ id: string; seller: string; note: string }> };
  assert.deepEqual(mine.entryList.map((e) => [e.id, e.seller, e.note]), [[entryId, 'Ada', 'mine']]);
  assert.equal((await call('GET', `/${id}/entries/${entryId}/preview`)).status, 200);
  as(S2);
  const theirs = (await (await call('GET', `/${id}`)).json()) as { entryList?: unknown[] };
  assert.equal(theirs.entryList, undefined);
  assert.equal((await call('GET', `/${id}/entries/${entryId}/preview`)).status, 404);
});

test('the full files reach the buyer only after the win', async () => {
  const { call, as, id, entryId, advance } = await contestWithEntry();
  as(BUYER);
  assert.equal((await call('GET', `/${id}/entries/${entryId}/files/0`)).status, 404);
  as(S1);
  assert.equal((await call('GET', `/${id}/entries/${entryId}/files/0`)).status, 200, 'the entrant always can');
  advance(8 * DAY);
  as(BUYER);
  assert.equal((await call('POST', `/${id}/award`, { entryIds: [entryId] })).status, 200);
  const file = await call('GET', `/${id}/entries/${entryId}/files/0`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');
});

test('a file that is not an image or a PDF is refused', async () => {
  const { call, as, id } = await contestWithEntry();
  as(S2);
  const r = await call('POST', `/${id}/entries`, { files: [`data:image/png;base64,${Buffer.from('MZ not a picture').toString('base64')}`], note: '' });
  assert.equal(r.status, 400);
});

test('only the buyer picks winners', async () => {
  const { call, as, id, entryId, advance } = await contestWithEntry();
  advance(8 * DAY);
  as(S1);
  assert.equal((await call('POST', `/${id}/award`, { entryIds: [entryId] })).status, 409);
});
