import assert from 'node:assert/strict';
import test from 'node:test';
import { recentRecipients } from './recentPeople.js';

type Send = Parameters<typeof recentRecipients>[0][number];

const ME = '0x1111111111111111111111111111111111111111';
const ADA = '0x2222222222222222222222222222222222222222';
const TUNDE = '0x3333333333333333333333333333333333333333';
const MY_AGENT = '0x4444444444444444444444444444444444444444';

const sent = (to: string, at: number, extra: Partial<Send> = {}): Send => ({
  kind: 'cash_out',
  state: 'completed',
  initiatedBy: ME,
  participants: [{ address: ME, role: 'owner' }, { address: to, role: 'recipient' }],
  createdAt: at,
  updatedAt: at,
  completedAt: at,
  ...extra,
});

test('the people you sent to, newest first, each once', () => {
  const out = recentRecipients([sent(ADA, 1), sent(TUNDE, 3), sent(ADA, 5)], ME);
  assert.deepEqual(out, [ADA, TUNDE]);
});

test('only your own completed sends count', () => {
  const out = recentRecipients([
    sent(ADA, 1, { state: 'needs_attention' }),
    sent(TUNDE, 2, { initiatedBy: ADA }),
    sent(TUNDE, 3, { kind: 'escrow_funding' }),
  ], ME);
  assert.deepEqual(out, []);
});

test('you and your own agents are never a recent person', () => {
  const out = recentRecipients([sent(ME, 1), sent(MY_AGENT, 2), sent(ADA, 3)], ME, new Set([MY_AGENT]));
  assert.deepEqual(out, [ADA]);
});

test('a send paid across networks to someone else counts too', () => {
  assert.deepEqual(recentRecipients([sent(ADA, 1, { kind: 'bridge' })], ME), [ADA]);
});
