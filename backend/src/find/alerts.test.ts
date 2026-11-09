import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { buildAlertPeopleConfirm } from '../assistant/findActions.js';
import { alertNote, alertPicked, sendDue, type AlertDeps } from './alerts.js';
import { declineAlert } from './answers.js';
import { onFindEvent } from './alertsLive.js';
import { contactsOfFind, createContact, resetContactsForTests } from './contacts.js';
import { findByJob, resetFindsForTests, saveFind, type Find } from './finds.js';
import type { FoundRow } from './rank.js';

/// Deal alerts (view 72, Phase 3): the people picked are told, in their own
/// language and money; an offer or a no thanks answers; a closed request ends them.

beforeEach(() => {
  resetContactsForTests();
  resetFindsForTests();
});

const NOW = Date.UTC(2026, 10, 9, 9);
const row = (user: string, name: string): FoundRow => ({
  user, sellerAgent: `${user}agent`, tag: name.toLowerCase(), name, verified: true, tier: 'ESTABLISHED', rating: '4.8 from 12 deals', stars: 4.8, ratings: 12,
  distance: { key: 'about', km: 3 }, meet: { atMyPlace: true, comeToYouKm: null, online: false }, priceUsdc: '60', days: 5, reasons: [], recommended: false,
});
const FIND: Find = {
  id: '6f1c2a3b-0000-4000-8000-000000000001', owner: '0xbuyer', side: 'buyer', mode: 'choose', need: 'A tailor to make a dress', budgetUsdc: '75', kind: 'in_person',
  where: { scope: 'near' }, jobId: null, needId: null, rows: [row('0xngozi', 'Ngozi'), row('0xamaka', 'Amaka'), row('0xtunde', 'Tunde')], status: 'shortlisted', createdAt: NOW, endsAt: NOW + 5 * 86_400_000,
};

function deps(over: Partial<AlertDeps> = {}) {
  const notes: Array<{ to: string; heading: string; lines: string[]; jobId: string }> = [];
  let n = 0;
  const d: AlertDeps = {
    create: createContact,
    firstDue: () => async (sentAt) => sentAt + 7_200_000,
    saveFind,
    locale: async (p) => (p === '0xamaka' ? 'fr' : 'en'),
    money: async (p, usdc) => (p === '0xamaka' ? `${usdc} €` : `₦${Math.round(usdc * 1346).toLocaleString('en')}`),
    note: (to, data) => void notes.push({ to, ...data }),
    newId: () => `contact-${++n}`,
    ...over,
  };
  return { d, notes };
}

test('the people picked are told in their own language and money, with how far, never where', async () => {
  const { d, notes } = deps();
  const out = await alertPicked({ find: FIND, picks: [0, 1, 1], jobId: '0xjob', byDay: null }, NOW, d);
  assert.deepEqual(out, { asked: ['Ngozi', 'Amaka'], refused: [] });
  assert.equal(notes.length, 2);
  assert.deepEqual(notes[0], {
    to: '0xngozi', jobId: '0xjob', heading: 'Someone near you needs your work',
    lines: ['"A tailor to make a dress"', 'Budget about ₦100,950', 'About 3 km from you', 'Open it to send your price, or say no thanks.'],
  });
  assert.match(notes[1]!.heading, /Quelqu'un près de chez vous/);
  assert.match(notes[1]!.lines[1]!, /75 €/);
  const saved = await findByJob('0xjob');
  assert.equal(saved?.status, 'contacting');
  assert.equal((await contactsOfFind(FIND.id)).length, 2);
});

test('a reminder says so', async () => {
  const { d } = deps();
  const text = await alertNote({ to: '0xngozi', need: 'Logo', budgetUsdc: '50', kind: 'remote', distance: { key: 'unknown' }, byDay: null, reminder: true }, d);
  assert.equal(text.heading, 'Reminder: someone needs your work');
  assert.equal(text.lines.length, 3, 'no distance for online work');
});

test('an offer answers the alert; no thanks answers it too; a closed request ends the rest', async () => {
  const { d } = deps();
  await alertPicked({ find: FIND, picks: [0, 1, 2], jobId: '0xJOB', byDay: null }, NOW, d);
  await onFindEvent({ type: 'offer.created', jobId: '0xjob', actor: 'seller', ts: NOW, payload: { sellerUser: '0xNGOZI', buyerUser: '0xbuyer', priceUsdc: '58' } }, NOW);
  assert.equal(await declineAlert('0xamaka', '0xjob', NOW), 'declined');
  assert.equal(await declineAlert('0xstranger', '0xjob', NOW), 'none');
  const answers = Object.fromEntries((await contactsOfFind(FIND.id)).map((c) => [c.to, c.answer]));
  assert.deepEqual(answers, { '0xngozi': 'interested', '0xamaka': 'no', '0xtunde': null });
  await onFindEvent({ type: 'bid.accepted', jobId: '0xjob', actor: 'buyer', ts: NOW, payload: {} }, NOW);
  assert.equal((await findByJob('0xjob'))?.status, 'matched');
  assert.ok((await contactsOfFind(FIND.id)).every((c) => c.closedAt !== null && c.nextAt === null));
  assert.equal(await declineAlert('0xtunde', '0xjob', NOW), 'matched', 'a late answer after a match is thanked, not recorded');
});

test('the sweep sends a held alert, and nothing for a find with no request yet', async () => {
  const { d, notes } = deps();
  const c = { id: 'x', findId: FIND.id, from: '0xbuyer', to: '0xngozi', kind: 'alert' as const, needId: null, sentAt: NOW, delivered: true, nextAt: null, reminders: 1, answer: null, answeredAt: null, closedAt: null };
  await sendDue({ contact: c, step: 'remind' }, FIND, d);
  assert.equal(notes.length, 0);
  await sendDue({ contact: c, step: 'remind' }, { ...FIND, jobId: '0xjob' }, d);
  assert.equal(notes[0]?.heading, 'Reminder: someone near you needs your work');
});

test('the card says who is asked and that it stays private', () => {
  const card = buildAlertPeopleConfirm({ caller: '0xbuyer', find: FIND, picks: [0, 1], names: ['Ngozi', 'Amaka'], budget: 'About ₦100,950', now: NOW });
  assert.ok(!('error' in card));
  assert.equal(card.title, 'Post privately and tell 2 people');
  assert.equal(card.confirmLabel, 'Send to 2 people');
  assert.deepEqual(card.payload.find, { id: FIND.id, picks: [0, 1] });
  assert.equal(card.payload.deliveryKind, 'in_person');
  assert.ok(card.fields.some((f) => f.label === 'Asked' && f.value === 'Ngozi, Amaka'));
  assert.ok('error' in buildAlertPeopleConfirm({ caller: '0xbuyer', find: FIND, picks: [], names: [], budget: '', now: NOW }));
});
