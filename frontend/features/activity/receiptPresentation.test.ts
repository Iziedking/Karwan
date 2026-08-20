import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceiptSvg, redactWalletAddresses } from './receiptPresentation';

test('redacts EVM wallet addresses from ledger copy', () => {
  assert.equal(
    redactWalletAddresses('Paid to 0x1234567890123456789012345678901234567890'),
    'Paid to counterparty',
  );
});

test('receipt SVG carries the Karwan reference and excludes wallet addresses', () => {
  const svg = buildReceiptSvg({
    title: 'Escrow funding',
    summary: 'Paid to 0x1234567890123456789012345678901234567890',
    reference: 'KWN-AB12-CD34-EF56',
    amount: '10.00 USDC',
    status: 'COMPLETED',
    date: '20 Aug 2026',
    historicalNote: 'Historical transfer',
    sharedNote: 'Share safely',
  });
  assert.match(svg, /KWN-AB12-CD34-EF56/);
  assert.match(svg, /counterparty/);
  assert.match(svg, /KARWAN\./);
  assert.match(svg, /M104 124 L111 98 L116 113 L121 98 L128 124/);
  assert.match(svg, /Transaction receipt/);
  assert.match(svg, /<circle cx="54" cy="48" r="18"\/>/);
  assert.doesNotMatch(svg, /0x1234567890123456789012345678901234567890/);
});
