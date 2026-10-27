import assert from 'node:assert/strict';
import test from 'node:test';
import type { Context } from 'hono';
import type { SessionPayload } from '../auth/session.js';
import type { PresenceAction } from '../presence/action.js';
import { createRecordSetupRoutes } from './recordSetup.js';

const PERSON = `0x${'aa'.repeat(20)}`;

function harness(opts: { complete?: boolean; confirmed?: boolean } = {}) {
  const asked: PresenceAction[] = [];
  const seen: Array<[string, number]> = [];
  const ran: string[] = [];
  let status = { identityId: opts.complete ? 4n : 0n, buyerBound: !!opts.complete, buyerExpiresAt: opts.complete ? 9_999_999_999n : 0n, sellerBound: !!opts.complete };
  let session: SessionPayload | null = { address: PERSON, method: 'circle', email: 'a@example.com', exp: 9e9 };
  const app = createRecordSetupRoutes({
    identity: {
      identityStatus: async () => status,
      recordSteps: async () => ({
        complete: !!status.identityId,
        steps: status.identityId ? [] : [{ name: 'register' as const, to: `0x${'01'.repeat(20)}` as const, data: '0x1aa3a008' as const }],
        identityIdAfter: 41n,
        validUntil: 1_800_003_600n,
      }),
      ensureRecord: async () => 'ready' as const,
      freeBuyingAgent: async () => false,
      setUpIdentityForCustodial: async (user: string) => {
        ran.push(user);
        status = { identityId: 4n, buyerBound: true, buyerExpiresAt: 9_999_999_999n, sellerBound: true };
      },
    },
    session: (_c: Context) => session,
    markNudgeSeen: async (address, at) => { seen.push([address, at]); },
    requirePresence: async (c, action) => {
      asked.push(action);
      return opts.confirmed ? null : c.json({ code: 'CONFIRM_REQUIRED' }, 428);
    },
  });
  const call = (method: string) => app.request('/setup', { method });
  return { call, asked, ran, seen, app, setSession: (s: SessionPayload | null) => { session = s; } };
}

test('status_needs_a_session', async () => {
  const h = harness();
  h.setSession(null);
  assert.equal((await h.call('GET')).status, 401);
});

test('status_reports_the_record_and_the_limits_shown_on_the_card', async () => {
  const body = await (await harness().call('GET')).json();
  assert.equal(body.complete, false);
  assert.deepEqual(body.limits, { perPayment: '1005000000', total: '10000000000', days: 365 });
  assert.equal(body.steps, undefined, 'a custodial account gets no calls to sign');
});

test('setup_refuses_without_presence', async () => {
  const h = harness();
  const res = await h.call('POST');
  assert.equal(res.status, 428);
  assert.equal(h.asked[0]!.kind, 'record_setup');
  assert.deepEqual(h.asked[0]!.detail, { perPayment: '1005000000', total: '10000000000', days: '365' });
  assert.deepEqual(h.ran, []);
});

test('custodial_setup_runs_once_confirmed', async () => {
  const h = harness({ confirmed: true });
  const res = await h.call('POST');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).complete, true);
  assert.deepEqual(h.ran, [PERSON]);
});

test('a_web3_account_gets_its_calls_and_posts_after_sending_them', async () => {
  const h = harness();
  h.setSession({ address: PERSON, method: 'web3', exp: 9e9 });
  const status = await (await h.call('GET')).json();
  assert.deepEqual(status.steps.map((x: { name: string }) => x.name), ['register']);
  assert.equal(status.identityIdAfter, '41');
  assert.equal(status.validUntil, 1_800_003_600);
  const res = await h.call('POST');
  assert.equal(res.status, 409, 'nothing landed yet');
  assert.equal((await res.json()).error, 'record_setup_needed');
  assert.deepEqual(h.ran, [], 'Karwan never signs for a wallet the person holds');
  assert.deepEqual(h.asked, [], 'their own signatures are their presence');
});

test('a_complete_record_is_not_set_up_twice', async () => {
  const h = harness({ complete: true, confirmed: true });
  const res = await h.call('POST');
  assert.equal(res.status, 200);
  assert.deepEqual(h.ran, []);
});

test('nudge_seen_sets_shown_at', async () => {
  const h = harness();
  const res = await h.app.request('/nudge-seen', { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal(h.seen.length, 1);
  assert.equal(h.seen[0]![0], PERSON);
  h.setSession(null);
  assert.equal((await h.app.request('/nudge-seen', { method: 'POST' })).status, 401);
});
