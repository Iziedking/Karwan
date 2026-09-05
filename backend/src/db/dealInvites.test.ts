import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyInvitesForImport, type DealInvite } from './dealInvites.js';

function invite(token: string, createdAt: number, usedAt?: number): DealInvite {
  return {
    token,
    jobId: 'deal-1',
    role: 'seller',
    email: 'recipient@example.com',
    expiresAt: 10_000,
    createdAt,
    ...(usedAt == null ? {} : { usedAt }),
  };
}

test('legacy migration keeps used audit rows and only the newest pending invite per deal', () => {
  const selected = legacyInvitesForImport([
    invite('old-pending', 1),
    invite('used', 2, 3),
    invite('new-pending', 4),
  ]);
  assert.deepEqual(selected.map((entry) => entry.token).sort(), ['new-pending', 'used']);
});
