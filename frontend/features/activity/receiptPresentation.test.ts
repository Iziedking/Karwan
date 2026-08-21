import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReceiptSvg,
  readableMovementText,
  redactWalletAddresses,
  shortenDealIds,
} from './receiptPresentation';

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

test('shortens a deal id to something readable inside a sentence', () => {
  const jobId = '0x6087117426579c1d136cb9319ee0bddecf2f1003a4ece99c1f3d7aaa1bbb2ccc';
  const line = shortenDealIds(`Released milestone 2 on deal ${jobId} to the seller`);
  assert.equal(line, 'Released milestone 2 on deal 0x608711…2ccc to the seller');
  // A 20-byte wallet address is not a deal id and is left for the redactor.
  assert.equal(
    shortenDealIds('Paid to 0x1234567890123456789012345678901234567890'),
    'Paid to 0x1234567890123456789012345678901234567890',
  );
});

test('one pipeline redacts the wallet and shortens the deal', () => {
  const text = readableMovementText(
    'Sent to 0x1234567890123456789012345678901234567890 on deal 0x6087117426579c1d136cb9319ee0bddecf2f1003a4ece99c1f3d7aaa1bbb2ccc',
  );
  assert.equal(text, 'Sent to counterparty on deal 0x608711…2ccc');
});
