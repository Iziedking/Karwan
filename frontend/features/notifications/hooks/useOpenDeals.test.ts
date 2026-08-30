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
