import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryTick } from './watcher.js';
import { RECOVERY_WAIT_MS, RELEASED_TTL_MS, type RecoveryRequest } from './rules.js';

const waiting: RecoveryRequest = {
  id: 'a', walletAddress: '0xa', state: 'waiting', createdAt: 0, releasableAt: RECOVERY_WAIT_MS,
  releasedAt: null, completedAt: null, cancelledAt: null, reminderSentAt: null,
};
const released: RecoveryRequest = { ...waiting, id: 'b', state: 'released', releasedAt: 0 };

function deps(list: RecoveryRequest[]) {
  const patches: Array<[string, Partial<RecoveryRequest>]> = [];
  const mails: string[] = [];
  return {
    patches,
    mails,
    d: {
      list: async () => list,
      patch: async (id: string, p: Partial<RecoveryRequest>) => { patches.push([id, p]); },
      emailFor: async () => 'ada@example.com',
      send: async (_to: string, kind: 'reminder') => { mails.push(kind); },
    },
  };
}

test('an unfinished release expires after 24 hours; a fresh wait gets no reminder yet', async () => {
  const { patches, mails, d } = deps([waiting, released]);
  await recoveryTick(RELEASED_TTL_MS + 1, d);
  assert.deepEqual(mails, []);
  assert.deepEqual(patches, [['b', { state: 'expired' }]]);
});

test('the reminder goes one hour before release and is recorded so it goes once', async () => {
  const { patches, mails, d } = deps([waiting]);
  const t = RECOVERY_WAIT_MS - 60 * 60 * 1000;
  await recoveryTick(t, d);
  assert.deepEqual(mails, ['reminder']);
  assert.deepEqual(patches, [['a', { reminderSentAt: t }]]);
});
