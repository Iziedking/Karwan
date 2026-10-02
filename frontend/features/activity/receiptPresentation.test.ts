import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReceiptSvg,
  readableMovementText,
  redactWalletAddresses,
  shortenDealIds,
  shortenHash,
} from './receiptPresentation';
import { CAMEL_PATH } from '@/shared/components/CaravanStamp';

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
    referenceLabel: 'KARWAN REFERENCE',
    referenceNone: 'Not recorded',
    historicalNote: 'Historical transfer',
    sharedNote: 'Share safely',
  });
  assert.match(svg, /KWN-AB12-CD34-EF56/);
  assert.match(svg, /counterparty/);
  assert.match(svg, />Karwan</);
  // Signed off by the caravan stamp, not a watermark or scalloped edges.
  assert.ok(svg.includes(CAMEL_PATH));
  // The real Karwan mark, not a letter in a box.
  assert.match(svg, /M148,362 L215,150 L256,278 L297,150 L364,362/);
  assert.doesNotMatch(svg, /KARWAN\./);
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

test('a receipt with no Karwan reference carries the transaction instead', () => {
  // The apology for a missing reference must not sit where an identifier goes:
  // the movement settled somewhere, and that hash is the verifiable identity.
  const svg = buildReceiptSvg({
    title: 'Deposit',
    summary: 'Added 20 USDC from Avalanche Fuji',
    reference: null,
    amount: '20 USDC',
    status: 'COMPLETED',
    date: '20 Aug 2026',
    transaction: { label: 'TRANSACTION', value: '0x608711…2ccc' },
    referenceLabel: 'KARWAN REFERENCE',
    referenceNone: 'Not recorded',
    historicalNote: 'Completed before Karwan references were enabled.',
    sharedNote: 'Share safely',
  });
  assert.match(svg, /TRANSACTION/);
  assert.match(svg, /0x608711/);
  assert.doesNotMatch(svg, /Completed before Karwan references/);
  // The identifier appears once, not as its own label and value.
  assert.equal(svg.match(/TRANSACTION/g)?.length, 1);
});

test('a receipt with both prints the reference and the transaction', () => {
  const svg = buildReceiptSvg({
    title: 'Milestone',
    summary: 'Released milestone 2',
    reference: 'KWN-AB12-CD34-EF56',
    amount: '1200.00 USDC',
    status: 'COMPLETED',
    date: '20 Aug 2026',
    transaction: { label: 'TRANSACTION', value: '0x608711…2ccc' },
    referenceLabel: 'KARWAN REFERENCE',
    referenceNone: 'Not recorded',
    historicalNote: 'n/a',
    sharedNote: 'Share safely',
  });
  assert.match(svg, /KWN-AB12-CD34-EF56/);
  assert.match(svg, /0x608711/);
});

test('with neither a reference nor a transaction the field says so plainly', () => {
  const svg = buildReceiptSvg({
    title: 'Deposit',
    summary: 'Added 20 USDC',
    reference: null,
    amount: '20 USDC',
    status: 'COMPLETED',
    date: '20 Aug 2026',
    referenceLabel: 'KARWAN REFERENCE',
    referenceNone: 'Not recorded',
    historicalNote: 'Completed before Karwan references were enabled.',
    sharedNote: 'Share safely',
  });
  assert.match(svg, /Not recorded/);
});

test('one hash, one abbreviation, wherever it is shown', () => {
  const jobId = '0x6087117426579c1d136cb9319ee0bddecf2f1003a4ece99c1f3d7aaa1bbb2ccc';
  assert.equal(shortenHash(jobId), '0x608711…2ccc');
  assert.equal(shortenDealIds(jobId), shortenHash(jobId));
  // Short enough to read whole is left alone.
  assert.equal(shortenHash('0x1234'), '0x1234');
});

test('the image follows the card: amount, sentence, rows, proof and a testnet note', () => {
  const svg = buildReceiptSvg({
    title: 'Karwan receipt',
    summary: 'Sent 10 USDC from Ethereum Sepolia to @izieking',
    reference: 'KRW-2026-1002-7Q2M',
    amount: '10 USDC',
    status: 'Completed',
    date: '2 Oct 2026, 06:24',
    transaction: { label: 'Transaction', value: '0x7a1c…e902' },
    referenceLabel: 'Karwan reference',
    referenceNone: 'Not recorded',
    historicalNote: 'n/a',
    sharedNote: 'Share safely',
    done: true,
    verifyTitle: 'Scan to verify on Arc',
    verifyUrl: 'https://testnet.arcscan.app/tx/0x7a1c',
    footnote: 'Arc testnet, no real value',
  });
  assert.match(svg, />10<tspan[^>]*>USDC</);
  assert.match(svg, /Sent 10 USDC from Ethereum Sepolia to @izieking/);
  assert.match(svg, /Scan to verify on Arc/);
  assert.match(svg, /testnet\.arcscan\.app/);
  // The QR is drawn into the image: a white tile and many dark modules.
  assert.ok((svg.match(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+"\/>/g) ?? []).length > 100);
  assert.match(svg, /Arc testnet, no real value/);
  assert.match(svg, /#E7F0CF/);
});
