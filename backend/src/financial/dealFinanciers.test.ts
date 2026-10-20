import test from 'node:test';
import assert from 'node:assert/strict';
import type { FactoringOffer } from '../db/factoring.js';
import type { POFinancingLine } from '../db/poFinancing.js';
import { FINANCIER_FOLLOWS, financedJobsFrom, financiersFrom, financierAlert } from './dealFinanciers.js';

const F = `0x${'f'.repeat(40)}`;
const offer = (status: FactoringOffer['status'], invoiceId = '0xdeal1') =>
  ({ id: 'off-1', invoiceId, financier: F.toUpperCase(), seller: '0xs', status } as unknown as FactoringOffer);
const line = (state: POFinancingLine['state'], invoiceId = '0xdeal2') =>
  ({ id: 'line-1', invoiceId, financier: F, seller: '0xs', state } as unknown as POFinancingLine);

test('a financier waiting on a deal is told, with a link to their own position', () => {
  assert.deepEqual(financiersFrom(offer('accepted'), null), [{ financier: F, href: '/financier/factoring/off-1' }]);
  assert.deepEqual(financiersFrom(null, line('outstanding')), [{ financier: F, href: '/financier/po/line-1' }]);
});

test('nobody is told once the position is finished or never advanced', () => {
  assert.deepEqual(financiersFrom(offer('offered'), line('repaid')), []);
  assert.deepEqual(financiersFrom(offer('settled'), line('defaulted')), []);
});

test('the same financier on both kinds of position on one deal hears once', () => {
  assert.equal(financiersFrom(offer('accepted', '0xd'), line('outstanding', '0xd')).length, 1);
});

test('financed deals include finished positions, so their history still reads', () => {
  const jobs = financedJobsFrom([offer('settled', '0xA'), offer('offered', '0xB')], [line('repaid', '0xC')]);
  assert.deepEqual([...jobs].sort(), ['0xa', '0xc']);
});

test('every followed event has copy in every locale, and nothing else does', () => {
  for (const type of FINANCIER_FOLLOWS) {
    for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
      const alert = financierAlert(type, locale);
      assert.ok(alert && alert.title && alert.body && alert.open, `${type} ${locale}`);
      assert.doesNotMatch(alert!.body, /—/, 'no em dashes');
    }
  }
  assert.equal(financierAlert('deal.matched'), null);
  assert.equal(financierAlert('chat.message'), null);
});

test('the financier reads the deal stage in the same words as their Open deals list', async () => {
  const { financedStage } = await import('./dealFinanciers.js');
  const now = 1_000_000;
  assert.equal(financedStage('awaiting-delivery', now / 1000 + 60, now), 'delivering');
  assert.equal(financedStage('awaiting-delivery', now / 1000 - 60, now), 'overdue');
  assert.equal(financedStage('awaiting-final-release', undefined, now), 'reviewing');
  assert.equal(financedStage('disputed', undefined, now), 'disputed');
  assert.equal(financedStage('settled', undefined, now), 'complete');
  assert.equal(financedStage('cancelled', undefined, now), 'refunded');
});
