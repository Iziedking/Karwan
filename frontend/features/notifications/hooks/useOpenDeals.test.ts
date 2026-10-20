import assert from 'node:assert/strict';
import test from 'node:test';
import { directDealNeedsViewer, isOpenDirectDealStage } from '../openDealsModel';

test('terminal direct deals do not stay in the open-deals inbox', () => {
  assert.equal(isOpenDirectDealStage('settled'), false);
  assert.equal(isOpenDirectDealStage('cancelled'), false);
  assert.equal(isOpenDirectDealStage('disputed'), false);
  assert.equal(isOpenDirectDealStage('awaiting-funding'), true);
});

test('direct-deal attention follows the party that owns the next action', () => {
  assert.equal(directDealNeedsViewer('awaiting-acceptance', false), true);
  assert.equal(directDealNeedsViewer('awaiting-acceptance', true), false);
  assert.equal(directDealNeedsViewer('awaiting-funding', true), true);
  assert.equal(directDealNeedsViewer('awaiting-delivery', false), true);
  assert.equal(directDealNeedsViewer('awaiting-first-release', true), true);
  assert.equal(directDealNeedsViewer('awaiting-final-release', false), false);
});

test('a financed deal reads from the financier side, in plain stage words', async () => {
  const { financedStage } = await import('../openDealsModel');
  const now = 1_000_000;
  assert.equal(financedStage('awaiting-delivery', now / 1000 + 60, now), 'delivering');
  assert.equal(financedStage('awaiting-delivery', now / 1000 - 60, now), 'overdue');
  assert.equal(financedStage('awaiting-first-release', undefined, now), 'reviewing');
  assert.equal(financedStage('awaiting-final-release', undefined, now), 'reviewing');
  assert.equal(financedStage('disputed', undefined, now), 'disputed');
  assert.equal(financedStage('settled', undefined, now), 'complete');
  assert.equal(financedStage('cancelled', undefined, now), 'refunded');
});

test('only positions still waiting on repayment are open, with what went out and what comes back', async () => {
  const { openFinancedPositions } = await import('../openDealsModel');
  const positions = openFinancedPositions(
    [
      { id: 'o1', invoiceId: '0xA', status: 'accepted', offeredAdvanceUsdc: '120', expectedReturnUsdc: '126' },
      { id: 'o2', invoiceId: '0xB', status: 'settled', offeredAdvanceUsdc: '50', expectedReturnUsdc: '52' },
      { id: 'o3', invoiceId: '0xC', status: 'offered', offeredAdvanceUsdc: '10', expectedReturnUsdc: '11' },
    ] as never,
    [
      { id: 'l1', invoiceId: '0xD', state: 'outstanding', principalUsdc: '300', repayUsdc: '315' },
      { id: 'l2', invoiceId: '0xE', state: 'repaid', principalUsdc: '1', repayUsdc: '2' },
    ] as never,
  );
  assert.deepEqual(positions, [
    { kind: 'factoring', id: 'o1', jobId: '0xa', advanced: '120', back: '126', href: '/financier/factoring/o1' },
    { kind: 'po', id: 'l1', jobId: '0xd', advanced: '300', back: '315', href: '/financier/po/l1' },
  ]);
});
