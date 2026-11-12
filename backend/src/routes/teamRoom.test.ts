import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// The team room and the overdue alert (view 78).
///
///   npx tsx --test src/routes/teamRoom.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run: DATABASE_URL is set');
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-team-room-')));
process.env.ADMIN_API_TOKEN = 'room-admin-test-token';
process.env.SUPPORT_API_TOKEN = 'room-support-test-token';

const { memoryCaseStore, useCaseStoreForTests } = await import('../support/cases.js');
const { memoryTeamRoomStore, useTeamRoomStoreForTests } = await import('../support/teamRoom.js');
const cases = memoryCaseStore('testnet');
const room = memoryTeamRoomStore();
useCaseStoreForTests(cases);
useTeamRoomStoreForTests(room);
const { teamRoomRoutes } = await import('./teamRoom.js');
const { supportDeskRoutes } = await import('./supportDesk.js');
const { raiseOverdue } = await import('../support/overdue.js');
const { createInvite, redeemInvite } = await import('../db/teamMembers.js');

const H = { 'x-admin-token': 'room-support-test-token', 'content-type': 'application/json' };
const T0 = Date.parse('2026-11-12T10:00:00+01:00');
const open = (now = T0) => cases.open({ address: '0xabc', contactVerified: true, kind: 'other', records: [], channel: 'web', text: 'Help', role: 'person', now });

test('the shared room and a case thread are kept apart', async () => {
  const k = await open();
  assert.equal((await teamRoomRoutes.request('/', { method: 'POST', headers: H, body: JSON.stringify({ text: 'Morning all' }) })).status, 200);
  assert.equal((await teamRoomRoutes.request('/', { method: 'POST', headers: H, body: JSON.stringify({ text: 'Partner says retry', case: k.ref }) })).status, 200);
  const shared = (await (await teamRoomRoutes.request('/', { headers: H })).json()) as { messages: Array<{ text: string }> };
  const thread = (await (await teamRoomRoutes.request(`/?case=${k.ref}`, { headers: H })).json()) as { messages: Array<{ text: string }> };
  assert.ok(shared.messages.some((m) => m.text === 'Morning all'));
  assert.ok(!shared.messages.some((m) => m.text === 'Partner says retry'));
  assert.deepEqual(thread.messages.map((m) => m.text), ['Partner says retry']);
  assert.equal((await teamRoomRoutes.request('/?case=KT-9999', { headers: H })).status, 404);
});

test('an overdue unanswered case alerts once, in the room and on Telegram', async () => {
  const k = await open(T0 - 3 * 3_600_000);
  const sent: string[] = [];
  const now = T0 + 3 * 3_600_000;
  const first = await raiseOverdue({ cases, room, telegram: async (t) => { sent.push(t); }, now });
  assert.ok(first.includes(k.ref));
  const again = await raiseOverdue({ cases, room, telegram: async (t) => { sent.push(t); }, now: now + 600_000 });
  assert.ok(!again.includes(k.ref));
  assert.equal(sent.filter((t) => t.includes(k.ref)).length, 1);
  assert.ok((await room.list({ caseId: k.id, limit: 10 })).some((m) => m.text.includes('is late by')));
});

test('asking a teammate sets asked and posts in the case thread', async () => {
  const { rawToken } = await createInvite({ email: 'israel@example.com', name: 'Israel', role: 'support' as never });
  const redeemed = await redeemInvite(rawToken, 'a long enough password');
  assert.ok(redeemed.ok);
  const member = redeemed.member;
  const k = await open();
  assert.equal((await supportDeskRoutes.request(`/${k.ref}/ask`, { method: 'POST', headers: H, body: JSON.stringify({ memberId: member.id, text: 'Can you check?' }) })).status, 200);
  assert.equal((await cases.get(k.ref))?.asked, member.id);
  assert.ok((await room.list({ caseId: k.id, limit: 10 })).some((m) => m.asks === member.id && m.text === 'Can you check?'));
});
