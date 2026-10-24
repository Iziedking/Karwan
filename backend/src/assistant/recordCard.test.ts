import assert from 'node:assert/strict';
import test from 'node:test';
import { recordSetupCard } from './recordCard.js';

const ME = `0x${'a1'.repeat(20)}`;
const NOW = 1_800_000_000;
const none = { identityId: 0n, buyerBound: false, sellerBound: false, buyerExpiresAt: 0n };

test('record_card_carries_the_spec_copy_and_limits', () => {
  const card = recordSetupCard(ME, none, NOW);
  assert.ok(card && 'intent' in card);
  if (!card || !('intent' in card)) return;
  assert.equal(card.intent, 'set_up_record');
  assert.equal(card.title, 'Set up your Karwan record');
  assert.equal(
    card.summary,
    'Your deals and checks are written to it. Your agents run your deals for you; your buying agent can pay up to 1,005 USDC at a time and 10,000 USDC in total for one year.',
  );
  assert.deepEqual(card.payload, { address: ME });
  assert.doesNotMatch(JSON.stringify(card), /stake|vault|yield|identity registry|\u2014/i);
});

test('a_complete_record_shows_no_card_and_an_expired_agent_asks_for_renewal', () => {
  assert.equal(recordSetupCard(ME, { identityId: 4n, buyerBound: true, sellerBound: true, buyerExpiresAt: BigInt(NOW + 100) }, NOW), null);
  const renew = recordSetupCard(ME, { identityId: 4n, buyerBound: true, sellerBound: true, buyerExpiresAt: BigInt(NOW - 1) }, NOW);
  assert.ok(renew && 'intent' in renew);
  if (renew && 'intent' in renew) assert.equal(renew.title, 'Renew your buying agent');
});

test('the network fee line says Karwan pays only where the gas policy is on and Karwan holds the wallet', () => {
  const fee = (opts: Parameters<typeof recordSetupCard>[3]) =>
    recordSetupCard(ME, none, NOW, opts)!.fields.find((f) => f.label === 'Network fee')?.value;
  assert.equal(fee({ gasPolicy: true, karwanHoldsWallet: true }), 'Paid by Karwan');
  assert.equal(fee({ gasPolicy: true, karwanHoldsWallet: false }), 'A small fee, in your own wallet');
  assert.equal(fee({ gasPolicy: false, karwanHoldsWallet: true }), undefined, 'no claim until the policy is set up');
  assert.equal(fee(undefined), undefined);
});
