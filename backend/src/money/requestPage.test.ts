import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-request-page-')));
delete process.env.DATABASE_URL;

const { createDepositRequest, saveDepositRequest, markDepositRequestMatched, listDepositRequests, listDepositRequestsPaidBy } =
  await import('./depositRequests.js');
const { pageOf, parsePageQuery } = await import('./requestPage.js');

const OWNER = '0x00000000000000000000000000000000000000c1';
const PAYER = '0x00000000000000000000000000000000000000d2';

test('a page query is read safely: a sane default, a ceiling, and a cursor only when it is a time', () => {
  assert.deepEqual(parsePageQuery({}), { limit: 10, before: undefined });
  assert.deepEqual(parsePageQuery({ limit: '5', before: '1700' }), { limit: 5, before: 1700 });
  assert.deepEqual(parsePageQuery({ limit: '500' }), { limit: 50, before: undefined });
  assert.deepEqual(parsePageQuery({ limit: '0', before: 'x' }), { limit: 10, before: undefined });
  assert.deepEqual(parsePageQuery({ before: '-3' }), { limit: 10, before: undefined });
});

test('a page keeps its limit and says where the next one starts only when more exist', () => {
  const rows = [{ t: 9 }, { t: 8 }, { t: 7 }];
  assert.deepEqual(pageOf(rows, 2, (r) => r.t), { items: [{ t: 9 }, { t: 8 }], next: 8 });
  assert.deepEqual(pageOf(rows, 3, (r) => r.t), { items: rows, next: null });
});

test('every request the owner made can be reached, page by page, newest first', async () => {
  for (let i = 1; i <= 7; i += 1) await saveDepositRequest(createDepositRequest({ owner: OWNER, amountUsdc: String(i), now: i * 1_000 }));
  const first = await listDepositRequests(OWNER, 3);
  assert.deepEqual(first.map((r) => r.createdAt), [7_000, 6_000, 5_000]);
  const second = await listDepositRequests(OWNER, 3, 5_000);
  assert.deepEqual(second.map((r) => r.createdAt), [4_000, 3_000, 2_000]);
  const last = await listDepositRequests(OWNER, 3, 2_000);
  assert.deepEqual(last.map((r) => r.createdAt), [1_000]);
});

test('every request someone paid can be reached, page by page, newest payment first', async () => {
  for (let i = 1; i <= 4; i += 1) {
    const request = createDepositRequest({ owner: OWNER, amountUsdc: '1', now: 100 + i });
    await saveDepositRequest(request);
    await markDepositRequestMatched(request, { txId: `arc:0xpage${i}`, chain: 'Arc', now: 10_000 + i, paidBy: PAYER });
  }
  const first = await listDepositRequestsPaidBy(PAYER, 2);
  assert.deepEqual(first.map((r) => r.matchedAt), [10_004, 10_003]);
  const second = await listDepositRequestsPaidBy(PAYER, 2, 10_003);
  assert.deepEqual(second.map((r) => r.matchedAt), [10_002, 10_001]);
});
