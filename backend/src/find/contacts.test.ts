import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { block, resetBlocksForTests } from './blocks.js';
import { answerContact, claimDue, closeContactsOfFind, contactsOfFind, createContact, deleteContactsOf, resetContactsForTests, type NewContact } from './contacts.js';
import { nextDue, runContactSweep, type SweepDeps } from './contactSweep.js';
import { DAY_MS, LIMITS } from './limits.js';

/// Deal alerts and pitches as rows with a due time (view 72), on the memory store.

beforeEach(() => {
  resetContactsForTests();
  resetBlocksForTests();
});

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 9, 9, 30);
const LAGOS = { timeZone: 'Africa/Lagos', quiet: { from: 21, to: 7 } };
const zoneOf = async () => LAGOS;
const firstDue = (to: string) => (sentAt: number) => nextDue({ kind: 'alert', sentAt, reminders: 0, to }, zoneOf);
let n = 0;
const alert = (to: string, over: Partial<NewContact> = {}): NewContact => ({ id: `c${++n}`, findId: 'find-1', from: '0xBUYER', to, kind: 'alert', needId: null, ...over });
const send = (c: NewContact, now = NOW) => createContact(c, now, firstDue(c.to));

test('an alert is created once per person per find, three open at a time', async () => {
  const first = await send(alert('0xA'));
  assert.ok(first.ok);
  assert.equal(first.contact.from, '0xbuyer');
  assert.equal(first.contact.nextAt, NOW + 2 * HOUR, 'first reminder two hours on');
  assert.deepEqual(await send(alert('0xa')), { ok: false, reason: 'already_contacted' });
  assert.ok((await send(alert('0xB'))).ok);
  assert.ok((await send(alert('0xC'))).ok);
  assert.deepEqual(await send(alert('0xD')), { ok: false, reason: 'find_full' });
});

test('limits hold when two writes race', async () => {
  const results = await Promise.all(['0xa', '0xb', '0xc', '0xd', '0xe'].map((to) => send(alert(to))));
  assert.equal(results.filter((r) => r.ok).length, LIMITS.alertsPerFind);
});

test('a block either way stops an alert', async () => {
  await block('0xa', '0xbuyer');
  assert.deepEqual(await send(alert('0xa')), { ok: false, reason: 'blocked' });
});

test('a seller with a full day gets it the next day, delivered by the sweep', async () => {
  for (let i = 0; i < LIMITS.sellerAlertsPerDay; i++) assert.ok((await send(alert('0xbusy', { findId: `f${i}`, from: `0xbuyer${i}` }))).ok);
  const held = await send(alert('0xbusy', { findId: 'late', from: '0xother' }));
  assert.ok(held.ok);
  assert.equal(held.contact.delivered, false);
  assert.equal(held.contact.nextAt, NOW + DAY_MS);
  const sent: string[] = [];
  const deps: SweepDeps = { claim: claimDue, zoneOf, send: async (c) => void sent.push(`${c.step}:${c.contact.findId}`) };
  await runContactSweep(NOW + DAY_MS, deps);
  assert.ok(sent.includes('deliver:late'));
});

test('one sweep claims a due reminder; a second sweep at the same time gets nothing', async () => {
  const c = await send(alert('0xa'));
  assert.ok(c.ok);
  const at = c.contact.nextAt!;
  const [one, two] = await Promise.all([claimDue(at, (x) => nextDue(x, zoneOf)), claimDue(at, (x) => nextDue(x, zoneOf))]);
  assert.equal(one.length + two.length, 1);
  const claimed = [...one, ...two][0]!;
  assert.equal(claimed.step, 'remind');
  assert.equal(claimed.contact.reminders, 1);
  assert.equal(claimed.contact.nextAt, Date.UTC(2026, 10, 10, 8), 'next morning at 9 in Lagos');
});

test('three reminders, then it closes with no answer; an answer or a match stops them', async () => {
  const c = await send(alert('0xa'));
  assert.ok(c.ok);
  const sent: number[] = [];
  const deps: SweepDeps = { claim: claimDue, zoneOf, send: async (x) => void sent.push(x.contact.reminders) };
  for (const at of [NOW + 2 * HOUR, Date.UTC(2026, 10, 10, 8), Date.UTC(2026, 10, 10, 17), NOW + 5 * DAY_MS]) await runContactSweep(at, deps);
  assert.deepEqual(sent, [1, 2, 3]);
  const [done] = await contactsOfFind('find-1');
  assert.equal(done!.nextAt, null);
  assert.notEqual(done!.closedAt, null);
  assert.equal(done!.answer, null, 'no mark: simply no answer');

  const d = await send(alert('0xb', { findId: 'find-2' }));
  assert.ok(d.ok);
  assert.equal(await answerContact(d.contact.id, '0xstranger', 'interested', NOW), null, 'only the person contacted answers');
  assert.equal((await answerContact(d.contact.id, '0xB', 'interested', NOW))?.answer, 'interested');
  assert.equal(await answerContact(d.contact.id, '0xb', 'no', NOW), null, 'answered once');
  assert.deepEqual(await claimDue(NOW + 5 * DAY_MS, (x) => nextDue(x, zoneOf)), []);

  const e = await send(alert('0xc', { findId: 'find-3' }));
  assert.ok(e.ok);
  await closeContactsOfFind('find-3', NOW);
  assert.deepEqual(await claimDue(NOW + 5 * DAY_MS, (x) => nextDue(x, zoneOf)), []);
});

test('deleting an account clears what it sent and received', async () => {
  assert.ok((await send(alert('0xa'))).ok);
  await deleteContactsOf('0xBUYER');
  assert.deepEqual(await contactsOfFind('find-1'), []);
});
