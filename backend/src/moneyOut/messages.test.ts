import assert from 'node:assert/strict';
import test from 'node:test';
import { addressAddedMessage, PAUSE_ID, removeId, shortAddress } from './messages.js';

test('an address is shortened to its first and last characters', () => {
  assert.equal(shortAddress('0x1234567890abcdef1234567890abcdef12345678'), '0x1234…5678');
  assert.equal(shortAddress('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'), '7xKX…gAsU');
});

test('the chat is told when an address is added, when it opens, and how to stop it', () => {
  const m = addressAddedMessage({
    id: '6f1c2c1e-6b0a-4b8e-9d55-3a1f0f6b7a10',
    chain: 'baseSepolia',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    addedAt: Date.UTC(2026, 9, 12, 14, 5),
    opensAt: Date.UTC(2026, 9, 13, 14, 5),
  });
  assert.equal(m.kind, 'buttons');
  if (m.kind !== 'buttons') return;
  assert.equal(
    m.body,
    'You added 0x1234…5678 on Base Sepolia as an address to send money to. It can receive money from 13 Oct, 14:05 UTC.\n\nNot you? Tap Remove, or pause every payment out of your account.',
  );
  assert.deepEqual(m.buttons, [
    { id: 'mo:rm:6f1c2c1e-6b0a-4b8e-9d55-3a1f0f6b7a10', title: 'Remove' },
    { id: PAUSE_ID, title: 'Pause my money' },
  ]);
  assert.ok(m.body.indexOf('—') === -1);
  for (const b of m.buttons) assert.ok(Buffer.byteLength(b.id) <= 64, 'fits a Telegram button');
});

test('a remove button carries the address id', () => {
  assert.equal(removeId('abc'), 'mo:rm:abc');
});

test('a payment out is announced with the amount, where it goes and a Pause button', async () => {
  const { paymentOutMessage } = await import('./messages.js');
  const out = paymentOutMessage({ exit: { kind: 'payout', chain: 'arc', address: '0x1234567890abcdef1234567890abcdef12345678' }, amountMicros: 12_500_000n });
  assert.equal(out.kind, 'buttons');
  if (out.kind !== 'buttons') return;
  assert.equal(out.body, '12.5 USDC is leaving your account for 0x1234…5678 on Arc.\n\nNot you? Pause every payment out of your account now.');
  assert.deepEqual(out.buttons, [{ id: PAUSE_ID, title: 'Pause my money' }]);

  const escrow = paymentOutMessage({ exit: { kind: 'escrow' }, amountMicros: 20_000_000n });
  assert.equal(escrow.kind === 'buttons' && escrow.body, '20 USDC is going into escrow for a deal.\n\nNot you? Pause every payment out of your account now.');
});
