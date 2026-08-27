import assert from 'node:assert/strict';
import test from 'node:test';
import { safeNotificationHref } from './notificationRouting';

test('repairs stale collection links when a notification has a deal id', () => {
  assert.equal(
    safeNotificationHref({ href: '/deals', jobId: '0xabc123' }),
    '/deals/0xabc123',
  );
  assert.equal(
    safeNotificationHref({ href: '/jobs/', jobId: 'request/with spaces' }),
    '/jobs/request%2Fwith%20spaces',
  );
});

test('falls back to the dashboard when a detail id is unavailable', () => {
  assert.equal(safeNotificationHref({ href: '/deals', jobId: '' }), '/app');
  assert.equal(safeNotificationHref({ href: '', jobId: null }), '/app');
});

test('preserves valid detail and profile destinations', () => {
  assert.equal(safeNotificationHref({ href: '/deals/0xabc', jobId: '' }), '/deals/0xabc');
  assert.equal(safeNotificationHref({ href: '/profile', jobId: '' }), '/profile');
});
