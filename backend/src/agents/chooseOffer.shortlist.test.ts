import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalGate, offerToChoose, withAgreedPrice } from './chooseOffer.js';

const bids = [
  { seller: '0xA', priceUsdc: '95' },
  { seller: '0xB', priceUsdc: '60' },
];
const open = { funded: false, approved: false, closed: false };

test('the seller who agreed a price is chosen at that price, others at their ask', () => {
  const priced = withAgreedPrice(bids, { sellerAgent: '0xa', agreedPriceUsdc: '80', declinedAt: undefined });
  assert.deepEqual(offerToChoose(priced, '0xA', open), { ok: true, seller: '0xA', priceUsdc: '80' });
  assert.deepEqual(offerToChoose(priced, '0xB', open), { ok: true, seller: '0xB', priceUsdc: '60' });
});

test('a declined agreement no longer sets the price', () => {
  const priced = withAgreedPrice(bids, { sellerAgent: '0xa', agreedPriceUsdc: '80', declinedAt: 5 });
  assert.equal((offerToChoose(priced, '0xA', open) as { priceUsdc: string }).priceUsdc, '95');
});

test('in shortlist mode only the buyer decides; the seller cannot approve', () => {
  assert.deepEqual(approvalGate({ shortlistMode: true, pendingRaise: false, caller: 's', buyer: 'b', seller: 's' }), { ok: false, status: 409, code: 'buyer-chooses' });
  assert.deepEqual(approvalGate({ shortlistMode: false, pendingRaise: false, caller: 's', buyer: 'b', seller: 's' }), { ok: true });
  assert.equal(approvalGate({ shortlistMode: false, pendingRaise: false, caller: 'b', buyer: 'b', seller: 's' }).ok, false);
  assert.deepEqual(approvalGate({ shortlistMode: true, pendingRaise: true, caller: 'b', buyer: 'b', seller: 's' }), { ok: true });
});

test('a choice funds only at the price the buyer saw', async () => {
  const { priceAsSeen } = await import('./chooseOffer.js');
  assert.equal(priceAsSeen('80', undefined), true);
  assert.equal(priceAsSeen('80', '80.00'), true);
  assert.equal(priceAsSeen('80', 80), true);
  assert.equal(priceAsSeen('92', '80'), false);
});
