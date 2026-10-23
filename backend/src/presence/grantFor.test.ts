import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionPayload } from '../auth/session.js';
import { presenceAction, type PresenceAction } from './action.js';
import { presenceService, presenceStore } from './live.js';

/// A confirmation the person gave, for route tests that move money: they
/// present it the way the website does instead of switching the check off.
export async function grantFor(session: Pick<SessionPayload, 'address' | 'method'> & Partial<SessionPayload>, action: PresenceAction): Promise<string> {
  const required = await presenceService.challengeFor({ exp: 9e9, ...session }, action);
  assert.ok(await presenceStore.confirm(required.challengeId, session.method === 'web3' ? 'wallet' : 'pin', Date.now()));
  return required.challengeId;
}

test('a test grant passes the live check once', async () => {
  const session = { address: '0x00000000000000000000000000000000000000aa', method: 'circle' as const };
  const action = presenceAction({ kind: 'move_out', wallet: session.address, amountMicros: '1', recipient: '0x00000000000000000000000000000000000000cc' });
  const grant = await grantFor(session, action);
  assert.deepEqual(await presenceService.confirmPresence({ account: { ...session, exp: 9e9 }, action, proof: grant }), { ok: true });
  assert.equal((await presenceService.confirmPresence({ account: { ...session, exp: 9e9 }, action, proof: grant })).ok, false);
});
