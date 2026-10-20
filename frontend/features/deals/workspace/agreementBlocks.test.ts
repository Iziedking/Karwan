import assert from 'node:assert/strict';
import test from 'node:test';
import { agreementBlocks } from './agreementBlocks';

const composed = [
  'Delivery: by 27 Oct.',
  'Payment: 2,000 USDC, locked when the deal is funded and released in 2 milestones:',
  '• Milestone 1, 50% (1,000 USDC): Start delivery by 13th november',
  '• Milestone 2, 50% (1,000 USDC): Confirmed by us on atleast by 28th november',
  'Proof of delivery: a link to the work.',
  'Time to check: 30 days after each delivery. If the buyer does not reply in that time, that part is paid to the seller.',
  'Late: if nothing is delivered by the deadline, unpaid parts return to the buyer.',
].join('\n');

test('the composed agreement reads as labelled facts with the milestones as their own list', () => {
  assert.deepEqual(agreementBlocks(composed), [
    { kind: 'fact', label: 'Delivery', body: 'by 27 Oct.' },
    {
      kind: 'fact',
      label: 'Payment',
      body: '2,000 USDC, locked when the deal is funded and released in 2 milestones',
      parts: [
        { title: 'Milestone 1', detail: '50% (1,000 USDC)', body: 'Start delivery by 13th november' },
        { title: 'Milestone 2', detail: '50% (1,000 USDC)', body: 'Confirmed by us on atleast by 28th november' },
      ],
    },
    { kind: 'fact', label: 'Proof of delivery', body: 'a link to the work.' },
    {
      kind: 'fact',
      label: 'Time to check',
      body: '30 days after each delivery. If the buyer does not reply in that time, that part is paid to the seller.',
    },
    { kind: 'fact', label: 'Late', body: 'if nothing is delivered by the deadline, unpaid parts return to the buyer.' },
  ]);
});

test('free text someone wrote themselves stays as their paragraphs', () => {
  assert.deepEqual(agreementBlocks('Build the landing page.\n\nShip it on Vercel with a contact form.'), [
    { kind: 'text', body: 'Build the landing page.' },
    { kind: 'text', body: 'Ship it on Vercel with a contact form.' },
  ]);
});

test('a line that opens with a link is text, not a label called https', () => {
  assert.deepEqual(agreementBlocks('https://example.com/brief: read this first'), [
    { kind: 'text', body: 'https://example.com/brief: read this first' },
  ]);
});

test('French spacing before the colon and Arabic commas still split cleanly', () => {
  assert.deepEqual(agreementBlocks('Livraison : avant le 27 oct.\n• Étape 1, 50 % (1 000 USDC) : Le logo'), [
    { kind: 'fact', label: 'Livraison', body: 'avant le 27 oct.', parts: [{ title: 'Étape 1', detail: '50 % (1 000 USDC)', body: 'Le logo' }] },
  ]);
  assert.deepEqual(agreementBlocks('• المرحلة 1، 50% (1,000 USDC): الشعار')[0], {
    kind: 'list',
    parts: [{ title: 'المرحلة 1', detail: '50% (1,000 USDC)', body: 'الشعار' }],
  });
});

test('a sentence that only mentions a colon late is not mistaken for a label', () => {
  const long = 'The seller will send weekly progress updates and the final files as follows: zip';
  assert.deepEqual(agreementBlocks(long), [{ kind: 'text', body: long }]);
});
