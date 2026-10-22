import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { counterpartyTools, pastCounterparties, type CounterpartyToolDeps } from './counterpartyTools.js';

/// "Find the person I bought from before" is answered from the user's own deals.
///
///   npx tsx --test src/assistant/counterpartyTools.test.ts

const call = { toolCallId: 't1', messages: [] };
const ME = '0xme';

function deal(over: Partial<DirectDeal>): DirectDeal {
  return {
    jobId: 'j', buyer: ME, seller: '0xmadie', dealAmountUsdc: '50', terms: 'Branded tape, 12 rolls',
    createdAt: 1_000, settledAt: 2_000,
    ...over,
  } as DirectDeal;
}

test('each person appears once, most recent first, with what was traded and the side the user was on', () => {
  const people = pastCounterparties([
    deal({ jobId: 'a', seller: '0xTUN', terms: 'Question bank', dealAmountUsdc: '45', createdAt: 100, settledAt: 200 }),
    deal({ jobId: 'b', seller: '0xmadie', createdAt: 900, settledAt: 1_000 }),
    deal({ jobId: 'c', seller: '0xtun', terms: 'Question bank, part 2', dealAmountUsdc: '40', createdAt: 300, settledAt: 400 }),
    deal({ jobId: 'd', buyer: '0xamina', seller: ME, terms: 'Dashboard', dealAmountUsdc: '350', createdAt: 50, settledAt: 60 }),
  ], ME);
  assert.deepEqual(people.map((p) => p.address), ['0xmadie', '0xtun', '0xamina']);
  assert.equal(people[1].deals, 2);
  assert.equal(people[1].lastItem, 'Question bank, part 2');
  assert.equal(people[1].lastAmountUsdc, '40');
  assert.equal(people[1].youWere, 'buyer');
  assert.equal(people[2].youWere, 'seller');
});

test('open, cancelled and own-address deals are not "people I traded with"', () => {
  const people = pastCounterparties([
    deal({ jobId: 'open', settledAt: undefined }),
    deal({ jobId: 'gone', cancelledAt: 5 } as Partial<DirectDeal>),
    deal({ jobId: 'self', seller: ME }),
  ], ME);
  assert.deepEqual(people, []);
});

test('the item line is short and single-line', () => {
  const [p] = pastCounterparties([deal({ terms: `Logo files\nround 2 ${'x'.repeat(200)}` })], ME);
  assert.ok(p.lastItem.length <= 80);
  assert.ok(!p.lastItem.includes('\n'));
});

test('the tool names each person by their tag and points at a repeat deal', async () => {
  const deps: CounterpartyToolDeps = {
    deals: async () => [deal({})],
    profile: async (a) => (a === '0xmadie' ? { handle: 'madie', displayName: 'Madu Okeke' } : null),
  };
  const out = (await counterpartyTools(ME, deps).list_people_i_traded_with.execute!({}, call)) as {
    people: Array<Record<string, unknown>>;
  };
  assert.equal(out.people.length, 1);
  assert.equal(out.people[0].tag, '@madie');
  assert.equal(out.people[0].name, 'Madu Okeke');
  assert.equal(out.people[0].buyAgain, '/buyer?mode=direct&seller=@madie&amount=50');
  assert.equal('address' in out.people[0], false);
});

test('with no settled deals the tool says so plainly', async () => {
  const out = (await counterpartyTools(ME, { deals: async () => [], profile: async () => null }).list_people_i_traded_with.execute!({}, call)) as Record<string, unknown>;
  assert.deepEqual(out.people, []);
  assert.match(String(out.note), /no finished deals/i);
});
