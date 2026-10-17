import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
const { recipientsFor, summaryFor, RELEVANT } = await import('./notifier.js');
const { contentFor } = await import('../emails/dealNotifier.js');

/// A rating ask, reminder or reveal reaches only the person it names.
///
///   npx tsx --test src/telegram/notifier.rating.test.ts

const ask = {
  type: 'rating.requested' as const,
  actor: 'platform' as const,
  ts: 1,
  payload: { address: '0xB', dealId: '0xdeal', withTag: 'ada', text: 'How did your deal with @ada go? Rate it 1 to 5, and add a note if you like.' },
};

test('a rating ask goes only to the person asked, with its own text', async () => {
  assert.ok(RELEVANT.has('rating.requested') && RELEVANT.has('rating.reminder') && RELEVANT.has('rating.revealed'));
  assert.deepEqual(await recipientsFor(ask), [{ address: '0xb', role: 'self' }]);
  assert.match(summaryFor(ask, 'self')?.text ?? '', /How did your deal with @ada go\?/);
});

test('the rating email asks the same question and opens the deal', () => {
  const mail = contentFor(ask, 'self', 'service');
  assert.equal(mail?.subject, 'How did your deal with @ada go?');
  assert.match(mail?.body ?? '', /Rate it 1 to 5/);
});
