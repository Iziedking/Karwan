import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEAL_ROUTE_RECOVERY_WINDOW_MS,
  dealRouteRecoveryKey,
  shouldAutomaticallyReloadDeal,
} from './dealRouteRecovery';

test('deal route recovery reloads once and stops a tight loop', () => {
  const now = 1_000_000;
  assert.equal(shouldAutomaticallyReloadDeal(null, now), true);
  assert.equal(shouldAutomaticallyReloadDeal(String(now), now + 1_000), false);
  assert.equal(
    shouldAutomaticallyReloadDeal(
      String(now),
      now + DEAL_ROUTE_RECOVERY_WINDOW_MS + 1,
    ),
    true,
  );
});

test('deal route recovery is scoped to the current deal path', () => {
  assert.equal(
    dealRouteRecoveryKey('/deals/0xabc'),
    'karwan:deal-route-recovery:/deals/0xabc',
  );
});

