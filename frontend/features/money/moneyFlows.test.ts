import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('send carries the amount from entry to receipt, with the person and a confirm sheet (view 50)', () => {
  const send = source('./components/SendFlow.tsx');
  assert.match(send, /<AmountHero/);
  assert.match(send, /<Keypad/);
  assert.match(send, /<ConfirmSheetShell/);
  assert.match(send, /<PersonRecord[^>]*known=/, 'a person found by tag is never shown by address');
  assert.match(send, /useMoneyMove\(\)/, 'the move is the same hook the drawer uses');
  assert.doesNotMatch(send, /--accent\b|--lp-accent/, 'green only through the primary button');
});

test('a request is one card the requester shares and the payer opens (view 50)', () => {
  const card = source('../payLink/PaymentCard.tsx');
  assert.match(card, /<PersonRecord/);
  assert.match(card, /data-payment-card=\{state\}/);
  assert.doesNotMatch(card, /--accent\b|--lp-accent/);
  assert.match(source('../payLink/CreatePayLink.tsx'), /<PaymentCard[\s\S]*state="open"/);
  assert.match(source('../payLink/PayRequestView.tsx'), /<PaymentCard recipient=\{request\.recipientAddress\}/);
});

test('the keypad reads left to right in every language', () => {
  assert.match(source('./components/Keypad.tsx'), /dir="ltr"/);
  assert.match(source('./components/AmountHero.tsx'), /dir="ltr"/);
});
