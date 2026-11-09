import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetWords, forViewer } from './budgetView.js';

/// View 73, decision 11: a seller reading a bargaining request sees a range and
/// never the budget.

const on = () => true;
const off = () => false;
const money = async (usdc: number) => `${usdc} USDC`;

function hasKeyDeep(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (value && typeof value === 'object') return Object.entries(value).some(([k, v]) => k === key || hasKeyDeep(v, key));
  return false;
}

const request = { jobId: '0xjob', budgetUsdc: '222', briefText: 'Two kaftans', bids: [{ seller: '0xs', priceUsdc: '200' }] };

test('a seller reading a bargaining request sees a range and never the budget', () => {
  const seen = forViewer(request, false, on);
  assert.equal(hasKeyDeep(seen, 'budgetUsdc'), false);
  assert.equal(JSON.stringify(seen).includes('222'), false);
  assert.deepEqual('budgetRange' in seen ? seen.budgetRange : null, { lowUsdc: 150, highUsdc: 230 });
  assert.equal(seen.briefText, 'Two kaftans', 'everything else stays');
});

test('the buyer keeps the exact budget', () => {
  assert.deepEqual(forViewer(request, true, on), request);
});

test('a request posted before the switch shows its budget as it did', () => {
  assert.deepEqual(forViewer(request, false, off), request);
});

test('a request with no budget shows no range', () => {
  const seen = forViewer({ ...request, budgetUsdc: '0' }, false, on);
  assert.equal('budgetRange' in seen ? seen.budgetRange : 'missing', null);
});

test('a list of requests is projected one by one', () => {
  const list = [request, { ...request, jobId: '0xold' }].map((r) => forViewer(r, false, (id) => id === '0xjob'));
  assert.equal(hasKeyDeep(list[0], 'budgetUsdc'), false);
  assert.equal((list[1] as { budgetUsdc?: string }).budgetUsdc, '222');
});

test('a seller tool says the budget in words as a range', async () => {
  assert.equal(await budgetWords('0xjob', 222, money, on), '150 USDC to 230 USDC');
  assert.equal(await budgetWords('0xjob', 222, money, off), 'about 222 USDC');
  assert.equal(await budgetWords('0xjob', 0, money, on), 'no budget said');
});
