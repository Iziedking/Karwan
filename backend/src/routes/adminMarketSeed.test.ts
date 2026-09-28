import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ADMIN_API_TOKEN = 'market-seed-admin-test-token';
const { adminMarketSeedRoutes } = await import('./adminMarketSeed.js');

const headers = { 'x-admin-token': 'market-seed-admin-test-token', 'content-type': 'application/json' };
const post = (path: string, body: unknown, h: Record<string, string> = headers) =>
  adminMarketSeedRoutes.request(path, { method: 'POST', headers: h, body: JSON.stringify(body) });

test('seeding is operator-only', async () => {
  const res = await post('/plan', { emails: ['a@example.com'] }, { 'content-type': 'application/json' });
  assert.equal(res.status, 401);
});

test('the dry run reports each account and writes nothing, even for an email with no account', async () => {
  const res = await post('/plan', { emails: ['nobody-here@example.com'] });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { mode: string; accounts: Array<{ ready: boolean; missing?: string; offers: number; requests: number; alreadyPresent: number }> };
  assert.equal(body.mode, 'dry-run');
  assert.equal(body.accounts[0]?.ready, false);
  assert.match(body.accounts[0]?.missing ?? '', /no testnet account/);
  assert.equal(body.accounts[0]?.offers, 150);
  assert.equal(body.accounts[0]?.requests, 50);
  assert.equal(body.accounts[0]?.alreadyPresent, 0);
});

test('a real run needs the typed confirmation, and unseeding needs its own', async () => {
  assert.equal((await post('/apply', { emails: ['a@example.com'] })).status, 400);
  assert.equal((await post('/unseed', {})).status, 400);
});
