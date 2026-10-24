import assert from 'node:assert/strict';
import test from 'node:test';
import { createSuiteEarnings, type EarningsMove, type SuiteEarningsDeps } from './suiteEarnings.js';

type Hex = `0x${string}`;
const AGENT = `0x${'33'.repeat(20)}` as Hex;
const SELLER = `0x${'b1'.repeat(20)}` as Hex;

interface Deal {
  jobId: string;
  seller: string;
  escrowVersion?: 'v2' | 'v3' | 'suite';
  sellerAgentWalletId?: string;
  sellerAgentAddress?: string;
  suiteEarnings?: Record<string, EarningsMove>;
}

function world(opts: { failFirst?: 'throw' | 'reverted'; deal?: Partial<Deal> } = {}) {
  const deals = new Map<string, Deal>([
    ['deal-1', { jobId: 'deal-1', seller: SELLER, escrowVersion: 'suite', sellerAgentWalletId: 'seller-w', sellerAgentAddress: AGENT, ...opts.deal }],
  ]);
  const transfers: Array<{ walletId: string; to: string; amountMicros: bigint; idempotencyKey: string }> = [];
  const landed = new Map<string, 'landed' | 'reverted' | 'unknown'>();
  let n = 0;
  let now = 1_000_000;
  const deps: SuiteEarningsDeps = {
    getDeal: async (id) => deals.get(id) ?? null,
    saveMove: async (id, key, move) => {
      const d = deals.get(id)!;
      d.suiteEarnings = { ...(d.suiteEarnings ?? {}), [key]: move };
    },
    listDeals: async () => [...deals.values()],
    transfer: async (input) => {
      transfers.push(input);
      n += 1;
      if (n === 1 && opts.failFirst === 'throw') throw new Error('circle timeout');
      const txHash = `0x${n.toString(16).padStart(64, '0')}`;
      landed.set(txHash, n === 1 && opts.failFirst === 'reverted' ? 'reverted' : 'landed');
      return { txHash };
    },
    transferProof: async (txHash) => landed.get(txHash) ?? 'unknown',
    now: () => now,
    log: () => undefined,
  };
  return { deps, deals, transfers, tick: (ms: number) => (now += ms) };
}

const payout = { type: 'escrow.milestone.released', jobId: 'deal-1', payload: { milestoneIndex: 0, sellerMicros: '495000000' } };

test('sweep_moves_exactly_the_released_amount', async () => {
  const w = world();
  const earnings = createSuiteEarnings(w.deps);
  const r = await earnings.onPayout(payout);
  assert.ok(r && 'txHash' in r);
  assert.deepEqual(w.transfers.map((t) => [t.walletId, t.to, t.amountMicros]), [['seller-w', SELLER, 495_000_000n]]);
  assert.equal(w.deals.get('deal-1')!.suiteEarnings!['0']!.state, 'moved');
  // The same payout seen again moves nothing more.
  await earnings.onPayout(payout);
  assert.equal(w.transfers.length, 1);
});

test('failed_sweep_is_retried_and_shown', async () => {
  const w = world({ failFirst: 'throw' });
  const earnings = createSuiteEarnings(w.deps);
  const r = await earnings.onPayout(payout);
  assert.deepEqual(r, { pending: true });
  const kept = w.deals.get('deal-1')!.suiteEarnings!['0']!;
  assert.equal(kept.state, 'pending');
  assert.equal(kept.amountMicros, '495000000');
  assert.deepEqual(earnings.pendingFor(w.deals.get('deal-1')!), { micros: 495_000_000n, count: 1 });
  w.tick(10 * 60_000);
  assert.equal(await earnings.retryPending(), 1);
  // No hash came back, so the retry repeats the same request for Circle to match.
  assert.equal(w.transfers[1]!.idempotencyKey, w.transfers[0]!.idempotencyKey);
  assert.equal(w.deals.get('deal-1')!.suiteEarnings!['0']!.state, 'moved');
  assert.deepEqual(earnings.pendingFor(w.deals.get('deal-1')!), { micros: 0n, count: 0 });
});

test('circle_receives_a_uuid_idempotency_key', async () => {
  // Circle refuses any idempotency key that is not a UUID ("API parameter invalid").
  const w = world();
  await createSuiteEarnings(w.deps).onPayout(payout);
  assert.match(w.transfers[0]!.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('a_reverted_move_is_sent_again_as_a_new_request', async () => {
  const w = world({ failFirst: 'reverted' });
  const earnings = createSuiteEarnings(w.deps);
  assert.deepEqual(await earnings.onPayout(payout), { pending: true });
  w.tick(10 * 60_000);
  await earnings.retryPending();
  assert.notEqual(w.transfers[1]!.idempotencyKey, w.transfers[0]!.idempotencyKey);
  assert.equal(w.transfers.reduce((s, t) => s + t.amountMicros, 0n), 990_000_000n, 'two sends, one of them reverted on chain');
  assert.equal(w.deals.get('deal-1')!.suiteEarnings!['0']!.state, 'moved');
});

test('sweep_runs_only_for_suite_deals', async () => {
  for (const escrowVersion of ['v2', 'v3', undefined] as const) {
    const w = world({ deal: { escrowVersion } });
    assert.equal(await createSuiteEarnings(w.deps).onPayout(payout), null);
    assert.equal(w.transfers.length, 0);
  }
});

test('a_ruling_or_split_share_moves_once_under_its_own_key', async () => {
  const w = world();
  const earnings = createSuiteEarnings(w.deps);
  const ruled = { type: 'escrow.seller.paid', jobId: 'deal-1', payload: { sellerMicros: '250000000', payoutKey: 'ruling:0xabc' } };
  await earnings.onPayout(ruled);
  await earnings.onPayout(ruled);
  assert.deepEqual(w.transfers.map((t) => t.amountMicros), [250_000_000n]);
  assert.equal(w.deals.get('deal-1')!.suiteEarnings!['ruling:0xabc']!.state, 'moved');
});
