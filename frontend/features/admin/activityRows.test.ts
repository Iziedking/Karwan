import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminDeskAction } from '@/core/api';
import { ACTIVITY_VIEWS, activityCsv, activityRow, activityShown } from './activityRows';

const AT = Date.UTC(2026, 10, 11, 13, 58);

function row(over: Partial<AdminDeskAction>): AdminDeskAction {
  return { id: 'a1', at: AT, memberId: 'm1', memberEmail: 'tobi@karwan.site', via: 'session', method: 'POST', path: '/', outcome: 'done', status: 200, request: null, result: null, ...over };
}
const names = (id: string | null) => (id === 'm1' ? 'Tobi Martins' : id === 'm2' ? 'Kemi Eze' : null);

test('asking for a release reads as a sentence, with the case it came from', () => {
  const r = activityRow(row({ path: '/api/admin/deals/0x7b2e00000000000000000000000000000000091c4/release', status: 202, request: { reason: 'KS-1042: buyer could not sign in' } }), names);
  assert.equal(r.who, 'Tobi Martins');
  assert.equal(r.what, 'Asked to pay the next part of deal 0x7b2e…91c4 (KS-1042)');
  assert.equal(r.second, 'Waits for a second teammate');
  assert.equal(r.kind, 'money');
});

test('a reply on a case names the case', () => {
  const r = activityRow(row({ path: '/api/admin/support/cases/KS-1042/reply' }), names);
  assert.equal(r.what, 'Replied on KS-1042');
  assert.equal(r.kind, 'other');
});

test('an approval says it was approved by whom and that it ran', () => {
  const r = activityRow(row({ memberId: 'm2', memberEmail: 'kemi@karwan.site', path: '/api/admin/requests/req-1/approve', result: { request: { label: 'Run the USYC wrap', requestedBy: { name: 'Tobi Martins' } } } }), names);
  assert.equal(r.who, 'Kemi Eze');
  assert.equal(r.what, 'Approved: Run the USYC wrap');
  assert.equal(r.second, 'Asked by Tobi Martins');
  assert.equal(r.kind, 'money');
});

test('a sign-in and a refusal read plainly', () => {
  const signIn = activityRow(row({ via: 'sign-in', path: '/api/admin/session' }), names);
  assert.equal(signIn.what, 'Signed in');
  assert.equal(signIn.kind, 'sign_in');
  const refused = activityRow(row({ path: '/api/admin/accounts/0x00000000000000000000000000000000000c41de/pause', outcome: 'refused', status: 403 }), names);
  assert.equal(refused.what, 'Pause money out for 0x0000…41de');
  assert.equal(refused.second, 'Refused');
  assert.equal(refused.kind, 'account');
});

test('anything else falls back to the address, never a blank line', () => {
  const r = activityRow(row({ method: 'PUT', path: '/api/admin/something/new', memberId: null, memberEmail: null, via: 'key' }), names);
  assert.equal(r.who, 'A desk key');
  assert.equal(r.what, 'PUT /api/admin/something/new');
});

test('the lists are All, Money moves, Account changes and Sign-ins', () => {
  assert.deepEqual(ACTIVITY_VIEWS.map((v) => v.label), ['All', 'Money moves', 'Account changes', 'Sign-ins']);
  const rows = [
    activityRow(row({ id: '1', via: 'sign-in', path: '/api/admin/session' }), names),
    activityRow(row({ id: '2', path: '/api/admin/requests/x/approve' }), names),
  ];
  assert.deepEqual(activityShown(rows, 'sign_in').map((r) => r.id), ['1']);
  assert.deepEqual(activityShown(rows, 'all').map((r) => r.id), ['1', '2']);
});

test('export writes the shown rows as CSV, quoting what needs it', () => {
  const csv = activityCsv([activityRow(row({ path: '/api/admin/support/cases/KS-1042/reply', memberEmail: null, memberId: 'm1' }), names)]);
  assert.equal(csv, 'when,who,what,detail\n2026-11-11T13:58:00.000Z,Tobi Martins,Replied on KS-1042,\n');
  const quoted = activityCsv([{ id: 'x', at: AT, who: 'A, B', what: 'Said "hi"', second: null, kind: 'other' }]);
  assert.equal(quoted, 'when,who,what,detail\n2026-11-11T13:58:00.000Z,"A, B","Said ""hi""",\n');
});
