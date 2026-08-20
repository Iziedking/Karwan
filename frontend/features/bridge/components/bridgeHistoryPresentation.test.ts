import assert from 'node:assert/strict';
import test from 'node:test';
import { completedBridgeLabel } from './bridgeHistoryPresentation';

test('labels completed inbound bridges as received', () => {
  assert.equal(
    completedBridgeLabel({ phase: 'done', direction: 'in', receivedLabel: 'ADDED · ARC', sentLabel: 'SENT · BASE' }),
    'ADDED · ARC',
  );
});

test('labels completed outbound bridges as sent', () => {
  assert.equal(
    completedBridgeLabel({ phase: 'done', direction: 'out', receivedLabel: 'ADDED · ARC', sentLabel: 'SENT · BASE' }),
    'SENT · BASE',
  );
});

test('keeps a live phase on its technical label', () => {
  assert.equal(
    completedBridgeLabel({ phase: 'burning', direction: 'out', receivedLabel: 'Preparing', sentLabel: 'SENT · BASE' }),
    'Preparing',
  );
});
