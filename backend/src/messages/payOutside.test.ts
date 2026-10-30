import assert from 'node:assert/strict';
import test from 'node:test';
import { asksToPayOutside } from './payOutside.js';

/// Asking to be paid outside Karwan is flagged in chat (view 32); Karwan's own
/// words about escrow never are.

test('asking to be paid outside Karwan is caught, in English and Pidgin', () => {
  for (const text of [
    'Just pay me directly, it is faster',
    'Send it to my account and I will ship today',
    'Transfer to my OPay 8031234567',
    'Abeg send am direct, no wahala',
    'No need for escrow, we can do it ourselves',
    'Pay outside Karwan and I give you discount',
    'Can we do this off Karwan?',
    'My account number is 0123456789, GTBank',
    'Pay before I send the phone',
    'Send the money to my PalmPay',
    'Send USDC to 0x1111111111111111111111111111111111111111 instead',
    'Moniepoint transfer is better for me',
  ]) {
    assert.equal(asksToPayOutside(text), true, text);
  }
});

test('ordinary talk and Karwan’s own words about escrow are not', () => {
  for (const text of [
    'I will pay into escrow tonight',
    'The transfer to escrow is done',
    'Payment is held by Karwan until you approve',
    'Can you deliver by Friday?',
    'I paid, please check the deal',
    'What colour is the phone?',
    'The account page shows my balance',
    'Send me the photos of the item',
    'Is the charger included?',
    'I will release the payment once it arrives',
  ]) {
    assert.equal(asksToPayOutside(text), false, text);
  }
});
