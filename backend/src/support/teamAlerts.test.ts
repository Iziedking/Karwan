import assert from 'node:assert/strict';
import test from 'node:test';
import { askedAlert, newCaseAlert, operatorChatAnswer, overdueAlert, overdueCases } from './teamAlerts.js';
import type { SupportCase } from './cases.js';

const NOW = Date.parse('2026-11-12T12:00:00+01:00');
const base: SupportCase = {
  id: 'c1', ref: 'KT-1042', contactVerified: true, kind: 'transfer_missing', state: 'new', lastChannel: 'telegram',
  records: [], fixes: [], dueAt: NOW - 60_000, createdAt: NOW - 7_260_000, updatedAt: NOW - 7_260_000, address: '0xabc',
};

test('an overdue unanswered case alerts once', () => {
  assert.deepEqual(overdueCases([base], NOW).map((c) => c.ref), ['KT-1042']);
  assert.deepEqual(overdueCases([{ ...base, overdueSentAt: NOW - 1 }], NOW), []);
});

test('an answered, solved or not yet due case never alerts', () => {
  assert.deepEqual(overdueCases([{ ...base, firstRepliedAt: NOW - 10 }], NOW), []);
  assert.deepEqual(overdueCases([{ ...base, state: 'solved' }], NOW), []);
  assert.deepEqual(overdueCases([{ ...base, dueAt: NOW + 60_000 }], NOW), []);
});

test('alerts name the case, the kind and the desk, never a way to reply in Telegram', () => {
  const fresh = newCaseAlert({ ref: 'KT-1042', kind: 'transfer_missing', who: '@chidi', lastChannel: 'telegram', firstLine: 'My payout never arrived' });
  assert.match(fresh, /New case KT-1042/);
  assert.match(fresh, /Transfer did not arrive/);
  assert.match(fresh, /Answer it on the support desk/);
  assert.doesNotMatch(fresh, /\/r |Reply to this message/);
  assert.match(overdueAlert(base, NOW), /KT-1042 is late by 1 min/);
  assert.match(askedAlert({ ref: 'KT-1042', asker: 'Tobi', asked: 'Israel', text: 'Can you check the partner?' }), /Israel, Tobi asks you about KT-1042: Can you check the partner\?/);
});

test('a reply in the team chat is not sent to the person', () => {
  assert.deepEqual(operatorChatAnswer('/r KT-1042 It is back in your balance', undefined), { ref: 'KT-1042' });
  assert.deepEqual(operatorChatAnswer('Released now', 'New case KT-1042\n...\n#KT-1042'), { ref: 'KT-1042' });
  assert.deepEqual(operatorChatAnswer('/close KSUP-0011223344', undefined), { ref: 'KSUP-0011223344' });
  assert.equal(operatorChatAnswer('good morning team', undefined), null);
});
