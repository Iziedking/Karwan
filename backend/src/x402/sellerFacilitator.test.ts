import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';

process.env.KARWAN_TREASURY_ADDR ??= '0x00000000000000000000000000000000000000aa';
const { ARC } = await import('../chain/client.js');
const { facilitator, requirePaymentAround } = await import('./sellerFacilitator.js');

/// Paid research is settled only when the search worked (view 48, decision 2;
/// docs/arc-circle-checks.md 3 Nov 2026): a failed search costs nothing.

const calls: string[] = [];
const fake = facilitator as unknown as Record<string, unknown>;
fake.getSupported = async () => ({
  kinds: [{ x402Version: 2, scheme: 'exact', network: ARC.caip2, extra: { verifyingContract: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9', assets: [{ symbol: 'USDC', address: '0x3600000000000000000000000000000000000000' }] } }],
});
let valid = true;
let settles = true;
fake.verify = async () => {
  calls.push('verify');
  return { isValid: valid, payer: '0xpayer', invalidReason: valid ? undefined : 'bad' };
};
fake.settle = async () => {
  calls.push('settle');
  return settles ? { success: true, transaction: 'tx-1', payer: '0xpayer' } : { success: false, errorReason: 'no funds' };
};

function app(work: () => Promise<string>) {
  const h = new Hono();
  h.get('/paid', async (c) => {
    const r = await requirePaymentAround(c, 0.009, 'test', async () => {
      calls.push('work');
      return work();
    });
    if (r instanceof Response) return r;
    return c.json({ result: r.result, tx: r.payment.transaction });
  });
  return h;
}
const signature = Buffer.from(JSON.stringify({ x402Version: 2, payload: {}, accepted: { network: ARC.caip2 } })).toString('base64');
const paidCall = (h: Hono) => h.request('/paid', { headers: { 'payment-signature': signature } });

test('with no payment it asks for the exact price and does no work', async () => {
  calls.length = 0;
  const res = await app(async () => 'read').request('/paid');
  assert.equal(res.status, 402);
  const offer = JSON.parse(Buffer.from(res.headers.get('PAYMENT-REQUIRED')!, 'base64').toString());
  assert.equal(offer.accepts[0].amount, '9000');
  assert.deepEqual(calls, []);
});

test('the payment is checked, the work done, then the payment settled', async () => {
  calls.length = 0;
  valid = true;
  settles = true;
  const res = await paidCall(app(async () => 'read'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { result: 'read', tx: 'tx-1' });
  assert.deepEqual(calls, ['verify', 'work', 'settle']);
});

test('work that fails is never settled, so nothing is paid', async () => {
  calls.length = 0;
  const res = await paidCall(app(async () => Promise.reject(new Error('every angle failed'))));
  assert.equal(res.status, 502);
  assert.deepEqual(calls, ['verify', 'work']);
  assert.match((await res.json()).error, /not charged/);
});

test('a payment that does not check out does no work', async () => {
  calls.length = 0;
  valid = false;
  const res = await paidCall(app(async () => 'read'));
  assert.equal(res.status, 402);
  assert.deepEqual(calls, ['verify']);
  valid = true;
});

test('a result is withheld when the payment does not settle', async () => {
  calls.length = 0;
  settles = false;
  const res = await paidCall(app(async () => 'read'));
  assert.equal(res.status, 402);
  assert.deepEqual(calls, ['verify', 'work', 'settle']);
  settles = true;
});
