import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDepositRequest,
  expireDepositRequest,
  selectDepositRequest,
  toPublicRequest,
  usdcToMicros,
} from './depositRequests.js';

const owner = '0x0000000000000000000000000000000000000001';

test('deposit request keeps exact amount precision and public fields safe', () => {
  const request = createDepositRequest({
    owner,
    amountUsdc: '12.340000',
    purpose: '  Solar lamps   for   Kano  ',
    ttlMinutes: 60,
    now: 1_000,
  });
  assert.equal(request.amountUsdc, '12.34');
  assert.equal(request.purpose, 'Solar lamps for Kano');
  assert.equal(request.expiresAt, 3_601_000);
  const publicRequest = toPublicRequest(request, 1_001);
  assert.equal(publicRequest.requestId, request.token);
  assert.equal('email' in publicRequest, false);
  assert.deepEqual(publicRequest.acceptedChains, ['Ethereum', 'Base', 'Arbitrum', 'Polygon', 'Solana']);
});

test('matching requires one exact open request', () => {
  const one = createDepositRequest({ owner, amountUsdc: '1.000001', now: 1_000 });
  assert.equal(
    selectDepositRequest([one], { amountUsdc: '1.000001', now: 2_000 })?.token,
    one.token,
  );
  assert.equal(selectDepositRequest([one], { amountUsdc: '1.000002', now: 2_000 }), null);

  const duplicate = createDepositRequest({ owner, amountUsdc: '1.000001', now: 1_000 });
  assert.equal(selectDepositRequest([one, duplicate], { amountUsdc: '1.000001', now: 2_000 }), null);

  const flexible = createDepositRequest({ owner, purpose: 'Open payment', now: 1_000 });
  assert.equal(selectDepositRequest([flexible], { amountUsdc: '9.50', now: 2_000 })?.token, flexible.token);
});

test('expired requests cannot be selected or reported as open', () => {
  const request = createDepositRequest({ owner, amountUsdc: '4', ttlMinutes: 5, now: 1_000 });
  assert.equal(selectDepositRequest([request], { amountUsdc: '4', now: request.expiresAt }), null);
  const expired = expireDepositRequest(request, request.expiresAt);
  assert.equal(expired.status, 'expired');
  assert.equal(toPublicRequest(request, request.expiresAt).status, 'expired');
});

test('USDC amounts compare in micros, not floating point', () => {
  assert.equal(usdcToMicros('0.000001'), 1n);
  assert.equal(usdcToMicros('12.34'), usdcToMicros('12.340000'));
  assert.notEqual(usdcToMicros('12.340001'), usdcToMicros('12.34'));
});

test('the public request shows what was received, what is left and where to send, never transfer ids', () => {
  const request = createDepositRequest({ owner, amountUsdc: '120', now: 1_000 });
  const pub = toPublicRequest(
    {
      ...request,
      receiving: { evm: { address: '0xab', wallets: { 'BASE-SEPOLIA': 'w1' } }, solana: { address: 'So1', walletId: 'w2' } },
      receipts: [{ txId: 'circle-secret-id', amountUsdc: '100', chain: 'Base', at: 2_000 }],
    },
    3_000,
  );
  assert.equal(pub.receivedUsdc, '100');
  assert.equal(pub.remainingUsdc, '20');
  assert.deepEqual(pub.receiving, { evm: { address: '0xab', chains: ['Ethereum', 'Base', 'Arbitrum', 'Polygon'] }, solana: { address: 'So1' } });
  assert.deepEqual(pub.payments, [{ amountUsdc: '100', chain: 'Base', at: 2_000 }]);
  assert.ok(!JSON.stringify(pub).includes('circle-secret-id'));
  assert.ok(!JSON.stringify(pub).includes('w1'));
});

test('a request nobody has sent to yet carries no receiving fields', () => {
  const pub = toPublicRequest(createDepositRequest({ owner, amountUsdc: '5', now: 1_000 }), 2_000);
  assert.equal(pub.receiving, undefined);
  assert.equal(pub.payments, undefined);
});
