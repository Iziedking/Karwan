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

test('a refusal from the chat deal limits is passed on in the words of the route', async () => {
  const execute = createExecutor({
    call: async () => ({
      status: 409,
      json: { error: 'Deals of 100 USDC and above are not open in this beta. Split the work into separate deals under 100 USDC.', code: 'CHAT_DEAL_LIMIT' },
    }),
  });
  const r = await execute({ address: ME }, action('choose_offer', { jobId: '0xj', caller: ME, seller: '0xs', amountUsdc: 250 }, 'g1'));
  assert.deepEqual(r, { ok: false, reason: 'refused', message: 'Deals of 100 USDC and above are not open in this beta. Split the work into separate deals under 100 USDC.' });
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
    body: { buyerAddress: ME, sellerAddress: '0xada', dealAmountUsdc: 80, terms: 'Logo, two rounds', deadlineDays: 5 },
  });
});

test('fund_direct_deal never pays more than the card showed', async () => {
  const { execute, calls } = setup((c) => {
    if (c.path.includes('funding-quote')) return { status: 200, json: { quote: { feeBps: 300, fundedAmountUsdc: '81.2', quoteFingerprint: `0x${'ab'.repeat(32)}` } } };
    return { status: 200, json: { deal: { agreementVersion: 2, agreementDigest: 'cd'.repeat(32) } } };
  });
  const r = await execute({ address: ME }, action('fund_direct_deal', { jobId: '0xd', caller: ME, seller: '0xada', amountUsdc: 80, maxFundedAmountUsdc: '80.4' }, 'd4'));
  assert.equal(r.ok, false);
  assert.ok(!calls.some((c) => c.path.endsWith('/fund')));
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

test('a channel that confirms money on Karwan refuses a money card that reaches the executor', async () => {
  const calls: string[] = [];
  const execute = createExecutor({
    call: async (_a, _m, path) => {
      calls.push(path);
      return { status: 200, json: {} };
    },
    refuse: new Set(['release_milestone']),
  });
  const r = await execute({ address: ME }, action('release_milestone', { jobId: '0xj', caller: ME }, 'm1'));
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /Karwan/);
  assert.equal(calls.length, 0);
  const other = await execute({ address: ME }, action('mark_delivered', { jobId: '0xj', caller: ME }, 'm2'));
  assert.equal(other.ok, true);
});

test('choose_offer passes the unverified acknowledgement to the route', async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: { accepted: true, txHash: '0x1' } }));
  await execute({ address: ME }, action('choose_offer', { jobId: '0xj', caller: ME, seller: '0xs', acknowledgeUnverified: true }));
  assert.deepEqual(calls[0]!.body, { caller: ME, seller: '0xs', acknowledgeUnverified: true });
});

test('a_confirmed_action_from_chat_answers_with_the_one_time_link', async () => {
  const { execute } = setup(() => ({ status: 428, json: { code: 'CONFIRM_REQUIRED', challengeId: 'c1', text: 'Karwan confirmation' } }));
  const r = await execute({ address: ME }, action('cash_out', { route: 'unified', destChainKey: 'baseSepolia', recipient: ME, amountUsdc: 5 }));
  assert.deepEqual(r, { ok: false, reason: 'refused', message: 'This step is confirmed on Karwan. Ask me again and I will send you the link.' });
});

test('a_pin_is_never_asked_in_the_chat', async () => {
  const { execute } = setup(() => ({ status: 428, json: { code: 'CONFIRM_REQUIRED', challengeId: 'c1' } }));
  const r = await execute({ address: ME }, action('stake_usdc', { address: ME, amountUsdc: 5 }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.doesNotMatch(r.message, /PIN|passkey/i);
});

test('taking out deal insurance starts the wait on each position on the card, as the stake page does', async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: { txHash: '0xcool' } }));
  const r = await execute({ address: ME }, action('insurance_take_out', { address: ME, positionIds: ['7', '9'], amountUsdc: '50.00', signer: 'karwan' }));
  assert.deepEqual(calls.map((c) => [c.method, c.path, (c.body as { positionId: string }).positionId]), [
    ['POST', '/api/vault/request-withdraw', '7'],
    ['POST', '/api/vault/request-withdraw', '9'],
  ]);
  assert.deepEqual(r, { ok: true, summary: 'The wait has started. Ask me to collect it when it ends.', txHash: '0xcool' });
});

test('a failed position stops the rest, and a wallet-signed card is sent to the app', async () => {
  const { execute, calls } = setup(() => ({ status: 409, json: { error: 'a vault action is already in progress for this position' } }));
  const r = await execute({ address: ME }, action('insurance_collect', { address: ME, positionIds: ['1', '2'], amountUsdc: '9.00', signer: 'karwan' }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/vault/claim');
  assert.equal(r.ok, false);

  const wallet = setup(() => ({ status: 200, json: {} }));
  const w = await wallet.execute({ address: ME }, action('insurance_cancel_take_out', { address: ME, positionIds: ['1'], amountUsdc: '9.00', signer: 'wallet' }, 'w1'));
  assert.equal(wallet.calls.length, 0);
  assert.equal(w.ok, false);
});

test('getting paid early runs the deal page and financier desk routes with their bodies', async () => {
  const JOB = `0x${'1'.repeat(64)}`;
  const OFFER = '5f0c1f8e-3f5c-4a52-9a1b-2b5b9f6f0d11';
  const { execute, calls } = setup(() => ({ status: 200, json: { ok: true } }));
  await execute({ address: ME }, action('finance_ask', { invoiceId: JOB, requestedAdvanceUsdc: '400', minAdvanceUsdc: '380' }));
  await execute({ address: ME }, action('finance_stop_asking', { invoiceId: JOB }));
  await execute({ address: ME }, action('finance_reject', { offerId: OFFER }));
  const offered = await execute({ address: ME }, action('finance_offer', { invoiceId: JOB, offeredAdvanceUsdc: '465.5', expectedReturnUsdc: '490', expiresInHours: 24, signer: 'karwan', advanceRecipient: ME }));
  await execute({ address: ME }, action('finance_apply', {}));
  assert.deepEqual(calls, [
    { method: 'POST', path: '/api/factoring/request', body: { invoiceId: JOB, requestedAdvanceUsdc: '400', minAdvanceUsdc: '380' } },
    { method: 'POST', path: '/api/factoring/withdraw-request', body: { invoiceId: JOB } },
    { method: 'POST', path: '/api/factoring/reject', body: { offerId: OFFER } },
    { method: 'POST', path: '/api/factoring/offer', body: { invoiceId: JOB, offeredAdvanceUsdc: '465.5', expectedReturnUsdc: '490', expiresInHours: 24 } },
    { method: 'POST', path: '/api/financier/apply', body: {} },
  ]);
  assert.deepEqual(offered, { ok: true, summary: 'Offer made. The seller sees it now.' });
});

test("a wallet financier's offer is never made from a chat", async () => {
  const { execute, calls } = setup(() => ({ status: 200, json: {} }));
  const r = await execute({ address: ME }, action('finance_offer', { invoiceId: `0x${'1'.repeat(64)}`, offeredAdvanceUsdc: '1', expectedReturnUsdc: '2', expiresInHours: 24, signer: 'wallet', advanceRecipient: ME }, 'fw'));
  assert.equal(calls.length, 0);
  assert.equal(r.ok, false);
});

test('deal steps run the deal page routes with their bodies, and a change of terms is an edit or a counter by side', async () => {
  const JOB = `0x${'2'.repeat(64)}`;
  const { execute, calls } = setup(() => ({ status: 200, json: { ok: true } }));
  for (const intent of ['goods_arrived', 'review_delivery_myself', 'claim_payment', 'still_reviewing', 'delay_appeal', 'take_back_deal']) {
    await execute({ address: ME }, action(intent, { jobId: JOB, caller: ME }));
  }
  await execute({ address: ME }, action('answer_delay_appeal', { jobId: JOB, caller: ME, reason: 'Checking the last part' }));
  await execute({ address: ME }, action('change_deal_terms', { jobId: JOB, caller: ME, as: 'buyer', dealAmountUsdc: 250 }));
  const countered = await execute({ address: ME }, action('change_deal_terms', { jobId: JOB, caller: ME, as: 'seller', terms: 'Two logos' }, 'ct2'));
  const path = (end: string) => `/api/deals/direct/${JOB}/${end}`;
  assert.deepEqual(calls, [
    { method: 'POST', path: path('arrived'), body: { caller: ME } },
    { method: 'POST', path: path('evidence/manual-review'), body: { caller: ME } },
    { method: 'POST', path: path('claim'), body: { caller: ME } },
    { method: 'POST', path: path('still-reviewing'), body: { caller: ME } },
    { method: 'POST', path: path('delay-appeal'), body: { caller: ME } },
    { method: 'POST', path: path('cancel'), body: { caller: ME } },
    { method: 'POST', path: path('delay-appeal-respond'), body: { caller: ME, reason: 'Checking the last part' } },
    { method: 'POST', path: path('edit'), body: { caller: ME, dealAmountUsdc: 250 } },
    { method: 'POST', path: path('counter'), body: { caller: ME, terms: 'Two logos' } },
  ]);
  assert.deepEqual(countered, { ok: true, summary: 'Sent. The other side sees the new terms.' });
});

test('offers on a request and near matches run the request page routes', async () => {
  const JOB = `0x${'3'.repeat(64)}`;
  const { execute, calls } = setup(() => ({ status: 200, json: { ok: true } }));
  await execute({ address: ME }, action('make_offer', { jobId: JOB, priceUsdc: '80', deliverByUnix: 1_800_000_000, note: 'Two drafts' }));
  await execute({ address: ME }, action('withdraw_offer', { jobId: JOB, offerId: 'o1' }));
  await execute({ address: ME }, action('accept_offer', { jobId: JOB, offerId: 'o2' }));
  await execute({ address: ME }, action('near_miss_proceed', { jobId: JOB, caller: ME }));
  await execute({ address: ME }, action('near_miss_pass', { jobId: JOB, caller: ME }));
  await execute({ address: ME }, action('reconsider_offer', { jobId: JOB, caller: ME }));
  assert.deepEqual(calls, [
    { method: 'POST', path: `/api/jobs/${JOB}/offers`, body: { priceUsdc: '80', deliverByUnix: 1_800_000_000, note: 'Two drafts' } },
    { method: 'POST', path: `/api/jobs/${JOB}/offers/o1/withdraw`, body: {} },
    { method: 'POST', path: `/api/jobs/${JOB}/offers/o2/accept`, body: {} },
    { method: 'POST', path: `/api/jobs/${JOB}/near-miss`, body: { caller: ME, action: 'proceed' } },
    { method: 'POST', path: `/api/jobs/${JOB}/near-miss`, body: { caller: ME, action: 'decline' } },
    { method: 'POST', path: `/api/jobs/${JOB}/reconsider`, body: { caller: ME } },
  ]);
});

test('editing an offer, stopping a bid and confirming goods received run the page routes', async () => {
  const JOB = `0x${'4'.repeat(64)}`;
  const { execute, calls } = setup(() => ({ status: 200, json: { ok: true } }));
  await execute({ address: ME }, action('edit_listing', { listingId: 'lst_1', caller: ME, askingPriceUsdc: 65 }));
  await execute({ address: ME }, action('stop_agent_bid', { jobId: JOB }));
  await execute({ address: ME }, action('confirm_goods_received', { address: ME, invoiceId: JOB, podHash: '0xab' }));
  assert.deepEqual(calls, [
    { method: 'POST', path: '/api/listings/lst_1/edit', body: { caller: ME, askingPriceUsdc: 65 } },
    { method: 'POST', path: '/api/agents/seller/bids/abandon', body: { jobId: JOB } },
    { method: 'POST', path: '/api/trade/pod/accept-circle', body: { address: ME, invoiceId: JOB, podHash: '0xab' } },
  ]);
});
