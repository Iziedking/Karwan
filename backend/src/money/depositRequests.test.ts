import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDepositRequest,
  DEFAULT_LINK_TTL_MINUTES,
  expireDepositRequest,
  linkTtlMinutes,
  MAX_REQUEST_TTL_MINUTES,
  pickDepositRequest,
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

test('a request can stay open for up to 90 days, and a link lasts 7 days unless the person picks', () => {
  const DAY = 24 * 60;
  assert.equal(MAX_REQUEST_TTL_MINUTES, 90 * DAY);
  assert.equal(DEFAULT_LINK_TTL_MINUTES, 7 * DAY);
  const ninety = createDepositRequest({ owner, ttlMinutes: 90 * DAY, now: 0 });
  assert.equal(ninety.expiresAt, 90 * DAY * 60_000);
  const tooLong = createDepositRequest({ owner, ttlMinutes: 400 * DAY, now: 0 });
  assert.equal(tooLong.expiresAt, 90 * DAY * 60_000);
});

test('a payment that fits two open requests marks neither and says how many it fits', () => {
  const a = createDepositRequest({ owner, amountUsdc: '100', now: 1_000 });
  const b = createDepositRequest({ owner, amountUsdc: '100', now: 1_001 });
  const c = createDepositRequest({ owner, amountUsdc: '40', now: 1_002 });
  assert.deepEqual(pickDepositRequest([a, b, c], { amountUsdc: '100', now: 2_000 }), { request: null, tied: 2 });
  assert.equal(pickDepositRequest([a, b, c], { amountUsdc: '40', now: 2_000 }).request?.token, c.token);
  assert.deepEqual(pickDepositRequest([a, b, c], { amountUsdc: '7', now: 2_000 }), { request: null, tied: 0 });
});

test('an expiry asked for in words becomes minutes: a day count, a date, or the 7-day default', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  assert.equal(linkTtlMinutes({}, now), 7 * 24 * 60);
  assert.equal(linkTtlMinutes({ expiresInDays: 30 }, now), 30 * 24 * 60);
  assert.equal(linkTtlMinutes({ expiresInMinutes: 90 }, now), 90);
  // Until the end of 6 Feb 2027, UTC.
  assert.equal(linkTtlMinutes({ expiresOn: '2027-02-06' }, now), Math.ceil((Date.parse('2027-02-06T23:59:59Z') - now) / 60_000));
  assert.throws(() => linkTtlMinutes({ expiresOn: '2026-11-01' }, now), /future/);
  assert.throws(() => linkTtlMinutes({ expiresOn: 'soon' }, now), /YYYY-MM-DD/);
});
