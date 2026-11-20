import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoredDealRecord } from '../db/dealRecords.js';
import type { DirectDeal } from '../db/deals.js';
import type { AssistantAction } from './actions.js';
import { dealRecordTools, type DealRecordToolDeps } from './dealRecordTools.js';
import { withDealReferences } from './dealReferences.js';

/// The deal record from any chat (view 94): read it on your own deals, share
/// it through a confirm card, stop sharing at once.
///
///   npx tsx --test src/assistant/dealRecordTools.test.ts

const ME = `0x${'a1'.repeat(20)}`;
const THEM = `0x${'b2'.repeat(20)}`;
const JOB = '0xd68fe7d8eaf9cde16836c248d1df7d5811342d77ad987d0b83fb2ccf5e888172';
const T = 1_763_500_000_000;

const deal = { jobId: JOB, buyer: ME, seller: THEM, settledAt: T + 6_000 } as DirectDeal;
const stored = {
  jobId: JOB,
  digest: '0x01',
  writtenAt: T + 9_000,
  proof: {},
  record: {
    reference: 'D68F-E7D8',
    kind: 'goods',
    agreed: { title: 'A navy suit', priceUsdc: '100', buyerAt: T, sellerAt: T, digest: null },
    held: { usdc: '100', at: T + 1_000, tx: '0xheld', reference: null },
    stages: [{ index: 0, confirmed: { way: 'handover_code', at: T + 5_000 }, released: { sellerUsdc: '99', refundUsdc: '0', feeUsdc: '1', at: T + 6_000, tx: '0xpaid', reference: null } }],
    ended: 'settled',
    endedAt: T + 6_000,
  },
} as unknown as StoredDealRecord;

function harness(over: Partial<DealRecordToolDeps> = {}) {
  const actions: AssistantAction[] = [];
  const stopped: string[] = [];
  let live: string | null = null;
  const deps: DealRecordToolDeps = {
    deal: async (jobId) => (jobId === JOB ? deal : null),
    record: async (jobId) => (jobId === JOB ? stored : null),
    share: async () => live,
    stop: async (jobId, side) => {
      stopped.push(`${jobId}:${side}`);
      const had = live !== null;
      live = null;
      return had;
    },
    base: 'https://karwan.site',
    ...over,
  };
  const setLive = (token: string | null) => {
    live = token;
  };
  return { tools: dealRecordTools(ME, actions, deps), actions, stopped, setLive };
}

test('reads the record of a deal the person is on', async () => {
  const { tools } = harness();
  const r = (await tools.deal_record.execute!({ jobId: JOB }, {} as never)) as Record<string, unknown>;
  assert.equal(r.reference, 'D68F-E7D8');
  assert.equal(r.side, 'buyer');
  assert.equal((r.stages as { confirmed: string }[])[0].confirmed, 'handover_code');
  assert.equal(r.page, `https://karwan.site/deals/${JOB}`);
  assert.equal(r.sharedLink, null);
});

test('refuses a deal the person is not on', async () => {
  const { tools } = harness({ deal: async () => ({ ...deal, buyer: THEM, seller: `0x${'c3'.repeat(20)}` }) as DirectDeal });
  const r = (await tools.deal_record.execute!({ jobId: JOB }, {} as never)) as { error?: string };
  assert.match(r.error ?? '', /not one of/);
  const s = (await tools.share_deal_record.execute!({ jobId: JOB }, {} as never)) as { error?: string };
  assert.match(s.error ?? '', /not one of/);
});

test('a deal reference like D68F-E7D8 finds the deal', async () => {
  const { tools } = harness();
  const wrapped = withDealReferences(tools, async () => [JOB]);
  const r = (await wrapped.deal_record.execute!({ jobId: 'D68F-E7D8' }, {} as never)) as { reference?: string };
  assert.equal(r.reference, 'D68F-E7D8');
});

test('a deal that has not ended has no record yet', async () => {
  const { tools } = harness({ deal: async () => ({ ...deal, settledAt: undefined }) as DirectDeal, record: async () => null });
  const r = (await tools.deal_record.execute!({ jobId: JOB }, {} as never)) as { error?: string };
  assert.match(r.error ?? '', /not ended/);
});

test('sharing needs the confirm card and makes no link by itself', async () => {
  const { tools, actions } = harness();
  const r = (await tools.share_deal_record.execute!({ jobId: JOB }, {} as never)) as { ok?: boolean };
  assert.equal(r.ok, true);
  assert.equal(actions.length, 1);
  const card = actions[0] as { intent: string; payload: { jobId: string; caller: string } };
  assert.equal(card.intent, 'share_deal_record');
  assert.deepEqual(card.payload, { jobId: JOB, caller: ME });
});

test('a record already shared gives back its live link, with no new card', async () => {
  const { tools, actions, setLive } = harness();
  setLive('tok123');
  const r = (await tools.share_deal_record.execute!({ jobId: JOB }, {} as never)) as { link?: string };
  assert.equal(r.link, 'https://karwan.site/deal-record/tok123');
  assert.equal(actions.length, 0);
});

test('stop sharing takes this side’s link back', async () => {
  const { tools, stopped, setLive } = harness();
  setLive('tok123');
  const r = (await tools.stop_sharing_deal_record.execute!({ jobId: JOB }, {} as never)) as { stopped?: boolean };
  assert.equal(r.stopped, true);
  assert.deepEqual(stopped, [`${JOB}:buyer`]);
});
