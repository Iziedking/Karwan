import assert from 'node:assert/strict';
import test from 'node:test';
import { InviteRecipientMismatchError, verifyInviteRecipient } from './inviteVerification.js';

test('successful verification reloads recipient authority before enabling claim', async () => {
  const calls: string[] = [];
  const invite = await verifyInviteRecipient({
    email: 'recipient@example.com',
    code: '123456',
    token: 'token',
    verifyOtp: async () => { calls.push('verify'); },
    refreshAuth: async () => { calls.push('refresh'); },
    loadInvite: async () => { calls.push('invite'); return { viewer: { canClaim: true } }; },
  });
  assert.equal(invite.viewer.canClaim, true);
  assert.deepEqual(calls, ['verify', 'refresh', 'invite']);
});

test('verification cannot expose claim to a different recipient', async () => {
  await assert.rejects(
    () => verifyInviteRecipient({
      email: 'wrong@example.com',
      code: '123456',
      token: 'token',
      verifyOtp: async () => undefined,
      refreshAuth: async () => undefined,
      loadInvite: async () => ({ viewer: { canClaim: false } }),
    }),
    InviteRecipientMismatchError,
  );
});
