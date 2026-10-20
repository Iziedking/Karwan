import assert from 'node:assert/strict';
import test from 'node:test';
import type { FactoringOffer, POFinancingLine } from '@/core/api';
import { notifyCopy } from '@/shared/i18n/messages/notifications';
import { FINANCED_DEAL_TYPES, financedNotice, financedPositions } from './financedDeal';

const offer = (status: FactoringOffer['status'], invoiceId: string, id = 'off-1') =>
  ({ id, invoiceId, status } as unknown as FactoringOffer);
const line = (invoiceId: string, id = 'line-1') => ({ id, invoiceId, state: 'outstanding' } as unknown as POFinancingLine);

test('only positions whose advance went out are followed, each opening its own page', () => {
  const positions = financedPositions([offer('accepted', '0xA'), offer('offered', '0xB', 'off-2')], [line('0xC')]);
  assert.deepEqual([...positions], [['0xa', '/financier/factoring/off-1'], ['0xc', '/financier/po/line-1']]);
});

test('a followed event on a financed deal becomes a plain notice that opens the position', () => {
  const positions = new Map([['0xa', '/financier/factoring/off-1']]);
  assert.deepEqual(financedNotice('deal.disputed', '0xA', positions, notifyCopy.en), {
    summary: 'A deal you financed is in dispute. The money in escrow is frozen.',
    href: '/financier/factoring/off-1',
  });
  assert.equal(financedNotice('deal.disputed', '0xB', positions, notifyCopy.en), null);
  assert.equal(financedNotice('chat.message', '0xA', positions, notifyCopy.en), null);
});

test('every followed event has copy in every locale', () => {
  const positions = new Map([['0xa', '/financier/po/line-1']]);
  for (const type of FINANCED_DEAL_TYPES) {
    for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
      assert.ok(financedNotice(type, '0xa', positions, notifyCopy[locale])?.summary, `${type} ${locale}`);
    }
  }
});
