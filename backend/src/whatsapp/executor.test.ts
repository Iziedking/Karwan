import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConfirmAction } from '../assistant/actions.js';
import { createExecutor } from './executor.js';

const ME = '0xabc0000000000000000000000000000000000001';

type Call = { method: string; path: string; body?: unknown };

function setup(answer: (c: Call) => { status: number; json: Record<string, unknown> }) {
  const calls: Call[] = [];
  const execute = createExecutor({
    call: async (_address, method, path, body) => {
      const c = { method, path, body };
      calls.push(c);
      return answer(c);
    },
  });
  return { execute, calls };
}

const action = (intent: string, payload: Record<string, unknown>, id = `${intent}:n1`) =>
  ({ kind: 'confirm', id, intent, title: intent, fields: [], payload }) as unknown as ConfirmAction;

test('release_milestone posts to the deal release route as the account', async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: { txHash: '0xfeed', settled: true } }));
  const r = await execute({ address: ME }, action('release_milestone', { jobId: '0xdeal', caller: ME }));
  assert.deepEqual(calls, [{ method: 'POST', path: '/api/deals/direct/0xdeal/release', body: { caller: ME } }]);
  assert.deepEqual(r, { ok: true, summary: 'Payment released.', txHash: '0xfeed' });
});

test('accept_deal reads the current agreement first and accepts that exact version', async () => {
  const { execute, calls } = setup((c) =>
    c.method === 'GET'
      ? { status: 200, json: { deal: { agreementVersion: 3, agreementDigest: '0xd1' } } }
      : { status: 200, json: { accepted: true } },
  );
  const r = await execute({ address: ME }, action('accept_deal', { jobId: '0xdeal', caller: ME }));
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[0].path, /^\/api\/deals\/direct\/0xdeal/);
  assert.deepEqual(calls[1].body, { caller: ME, expectedAgreementVersion: 3, expectedAgreementDigest: '0xd1' });
  assert.equal(r.ok, true);
});

test('accept_deal without a verifiable agreement does not accept', async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: { deal: {} } }));
  const r = await execute({ address: ME }, action('accept_deal', { jobId: '0xdeal', caller: ME }, 'a2'));
  assert.equal(calls.length, 1);
  assert.equal(r.ok, false);
});

test('executor rejects a reused nonce', async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: {} }));
  const a = action('cancel_request', { jobId: '0xj', caller: ME }, 'same-id');
  await execute({ address: ME }, a);
  const second = await execute({ address: ME }, a);
  assert.equal(calls.length, 1);
  assert.deepEqual(second, { ok: false, reason: 'reused', message: 'That is already done.' });
});

test('executor refuses a stale card with the route message', async () => {
  const { execute } = setup(() => ({ status: 409, json: { error: 'The deal moved on.' } }));
  const r = await execute({ address: ME }, action('release_milestone', { jobId: '0xd', caller: ME }, 's1'));
  assert.deepEqual(r, { ok: false, reason: 'stale', message: 'The deal moved on.' });
});

test('a server error never claims success and never invites a blind retry', async () => {
  const { execute } = setup(() => ({ status: 502, json: {} }));
  const r = await execute({ address: ME }, action('release_milestone', { jobId: '0xd', caller: ME }, 's2'));
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /check/i);
});

test('a money movement that needs attention is reported as not done', async () => {
  const { execute } = setup(() => ({ status: 200, json: { movementState: 'needs_attention', txHash: '0x1' } }));
  const r = await execute({ address: ME }, action('withdraw_proceeds', { address: ME, agent: 'seller', toAddress: '0x2', amountUsdc: 5 }, 'w1'));
  assert.equal(r.ok, false);
});

test('a money movement still confirming says so instead of done', async () => {
  const { execute } = setup(() => ({ status: 200, json: { movementState: 'submitted', txHash: '0x1' } }));
  const r = await execute({ address: ME }, action('withdraw_proceeds', { address: ME, agent: 'seller', toAddress: '0x2', amountUsdc: 5 }, 'w2'));
  assert.equal(r.ok, true);
  assert.match((r as { summary: string }).summary, /not complete yet/);
});

test('executor refuses web3-only intents', async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: {} }));
  for (const intent of ['top_up_web3', 'pool_usdc_web3', 'fund_agent_web3', 'cash_out_web3']) {
    const r = await execute({ address: ME }, action(intent, {}, `x-${intent}`));
    assert.equal(r.ok, false);
  }
  assert.equal(calls.length, 0);
});

test('post_request sends the deadline in seconds within the route bounds', async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: { jobId: '0xj', txHash: '0xt' } }));
  await execute({ address: ME }, action('post_request', { posterAddress: ME, brief: 'Logo', budgetUsdc: 80, deadlineDays: 2.5 }, 'p1'));
  assert.deepEqual(calls[0], { method: 'POST', path: '/api/jobs', body: { posterAddress: ME, brief: 'Logo', budgetUsdc: 80, deadlineSeconds: 216000 } });
});

test('cancel_deal follows its step', async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: {} }));
  await execute({ address: ME }, action('cancel_deal', { jobId: '0xd', caller: ME, step: 'propose', reason: 'Changed plans' }, 'c1'));
  await execute({ address: ME }, action('cancel_deal', { jobId: '0xd', caller: ME, step: 'accept' }, 'c2'));
  await execute({ address: ME }, action('cancel_deal', { jobId: '0xd', caller: ME, step: 'decline' }, 'c3'));
  assert.deepEqual(calls.map((c) => c.path), [
    '/api/deals/direct/0xd/cancel/propose',
    '/api/deals/direct/0xd/cancel/accept',
    '/api/deals/direct/0xd/cancel/decline',
  ]);
  assert.deepEqual(calls[0].body, { caller: ME, reason: 'Changed plans', kind: 'mutual' });
});

test('a funding card the deal gate refuses never reaches the route', async () => {
  const calls: string[] = [];
  const execute = createExecutor({
    call: async (_a, _m, path) => {
      calls.push(path);
      return { status: 200, json: { txHash: '0x1' } };
    },
    fundingGate: async (_account, deal) =>
      deal.amountUsdc >= 100 ? { ok: false, message: 'Deals of 100 USDC and above need an ID check from both sides first.' } : { ok: true },
  });
  const big = await execute({ address: ME }, action('choose_offer', { jobId: '0xj', caller: ME, seller: '0xs', amountUsdc: 250 }, 'g1'));
  assert.equal(big.ok, false);
  assert.match((big as { message: string }).message, /ID check/);
  assert.equal(calls.length, 0);
  const small = await execute({ address: ME }, action('choose_offer', { jobId: '0xj', caller: ME, seller: '0xs', amountUsdc: 50 }, 'g2'));
  assert.equal(small.ok, true);
  assert.equal(calls.length, 1);
});

test('the gate applies to approve_match only when the buyer approves', async () => {
  const gated: string[] = [];
  const execute = createExecutor({
    call: async () => ({ status: 200, json: {} }),
    fundingGate: async (account) => {
      gated.push(account.address);
      return { ok: true };
    },
  });
  await execute({ address: ME }, action('approve_match', { jobId: '0xj', caller: ME, buyer: '0xother', seller: ME, amountUsdc: 50 }, 'g3'));
  assert.equal(gated.length, 0, 'the seller approving does not fund');
  await execute({ address: ME }, action('approve_match', { jobId: '0xj', caller: ME, buyer: ME, seller: '0xs', amountUsdc: 50 }, 'g4'));
  assert.equal(gated.length, 1);
});

test('a funding card without its amount is refused when the gate is on', async () => {
  const calls: string[] = [];
  const execute = createExecutor({
    call: async (_a, _m, path) => {
      calls.push(path);
      return { status: 200, json: {} };
    },
    fundingGate: async () => ({ ok: true }),
  });
  const r = await execute({ address: ME }, action('choose_offer', { jobId: '0xj', caller: ME, seller: '0xs' }, 'g5'));
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test('create_direct_deal opens the deal through the app route with the agreed terms', async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: { deal: { jobId: '0xnew' } } }));
  const r = await execute(
    { address: ME },
    action('create_direct_deal', { buyerAddress: ME, sellerAddress: '0xada', dealAmountUsdc: 80, terms: 'Logo, two rounds', deadlineDays: 5 }, 'd1'),
  );
  assert.equal(r.ok, true);
  assert.deepEqual(calls[0], {
    method: 'POST',
    path: '/api/deals/direct',
    body: { buyerAddress: ME, sellerAddress: '0xada', dealAmountUsdc: 80, terms: 'Logo, two rounds', deadlineDays: 5, firstReleasePct: 100 },
  });
});

test('fund_direct_deal funds against a fresh quote and the current agreement', async () => {
  const { execute, calls } = setup((c) => {
    if (c.path.includes('funding-quote')) return { status: 200, json: { quote: { feeBps: 150, fundedAmountUsdc: '80.6', quoteFingerprint: `0x${'ab'.repeat(32)}` } } };
    if (c.method === 'GET') return { status: 200, json: { deal: { agreementVersion: 2, agreementDigest: 'cd'.repeat(32) } } };
    return { status: 200, json: { txHash: '0xfund' } };
  });
  const r = await execute({ address: ME }, action('fund_direct_deal', { jobId: '0xd', caller: ME, seller: '0xada', amountUsdc: 80 }, 'd2'));
  assert.equal(r.ok, true);
  const fund = calls.at(-1)!;
  assert.equal(fund.path, '/api/deals/direct/0xd/fund');
  assert.deepEqual(fund.body, {
    caller: ME,
    expectedFeeBps: 150,
    maxFundedAmountUsdc: '80.6',
    quoteFingerprint: `0x${'ab'.repeat(32)}`,
    expectedAgreementVersion: 2,
    expectedAgreementDigest: 'cd'.repeat(32),
  });
});

test('fund_direct_deal without a quote does not fund', async () => {
  const { execute, calls } = setup((c) => (c.path.includes('funding-quote') ? { status: 409, json: { error: 'Waiting on the seller.' } } : { status: 200, json: { deal: { agreementVersion: 1, agreementDigest: 'aa'.repeat(32) } } }));
  const r = await execute({ address: ME }, action('fund_direct_deal', { jobId: '0xd', caller: ME, seller: '0xada', amountUsdc: 80 }, 'd3'));
  assert.equal(r.ok, false);
  assert.ok(!calls.some((c) => c.path.endsWith('/fund')));
});
