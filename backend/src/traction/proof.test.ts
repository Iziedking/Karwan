import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTractionProof, maskAddress, maskContact, maskEmail, maskPhone } from './proof.js';

/// The public traction proof: counts anyone can watch grow, with each contact
/// masked so nobody can be reached or identified from it.
///
///   npx tsx --test src/traction/proof.test.ts

const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

test('an email keeps its first character and a common mail domain, nothing else', () => {
  assert.equal(maskEmail('amara.okafor@gmail.com'), 'a***@gmail.com');
  assert.equal(maskEmail('  Bola@Yahoo.com '), 'b***@yahoo.com');
});

test('a company domain is masked too, since it names the employer', () => {
  assert.equal(maskEmail('ceo@acme-trading.ng'), 'c***@a***.ng');
});

test('a phone keeps its country code and last two digits', () => {
  assert.equal(maskPhone('+234 803 555 0142'), '+234••••42');
  assert.equal(maskPhone('08035550142'), '+080••••42');
  assert.equal(maskPhone('12345'), '••••', 'too short to show anything');
});

test('contacts are classified as email or phone, and anything else hides fully', () => {
  assert.deepEqual(maskContact('amara@gmail.com'), { kind: 'email', masked: 'a***@gmail.com' });
  assert.deepEqual(maskContact('+234 803 555 0142'), { kind: 'phone', masked: '+234••••42' });
  assert.deepEqual(maskContact('@amara_tg'), { kind: 'other', masked: '•••' });
});

test('a wallet shows only its first four and last four characters', () => {
  assert.equal(maskAddress('0x1234567890abcdef1234567890abcdef12345678'), '0x1234…5678');
});

test('the proof counts by day, dedupes repeated contacts and never carries raw data', () => {
  const proof = buildTractionProof({
    waitlist: [
      { email: 'amara@gmail.com', joinedAt: day('2026-09-26'), useCases: ['sell_services'] },
      { email: 'bola@gmail.com', joinedAt: day('2026-10-16'), useCases: [] },
      { email: 'chidi@gmail.com', joinedAt: day('2026-10-16') },
    ],
    survey: [
      { createdAt: day('2026-10-16'), contact: 'amara@gmail.com' },
      { createdAt: day('2026-10-16'), contact: 'AMARA@gmail.com' },
      { createdAt: day('2026-10-16'), contact: '+234 803 555 0142' },
      { createdAt: day('2026-10-16'), contact: null },
    ],
    team: ['0x1234567890abcdef1234567890abcdef12345678', 'not-an-address'],
    now: day('2026-10-16'),
  });

  assert.equal(proof.waitlist.total, 3);
  assert.equal(proof.waitlist.withUseCase, 1);
  assert.deepEqual(proof.waitlist.byDay, [{ day: '2026-09-26', count: 1 }, { day: '2026-10-16', count: 2 }]);
  assert.deepEqual(proof.waitlist.contacts, ['a***@gmail.com', 'b***@gmail.com', 'c***@gmail.com']);

  assert.equal(proof.survey.total, 4);
  assert.equal(proof.survey.withContact, 3);
  assert.equal(proof.survey.distinctContacts, 2);
  assert.equal(proof.survey.emails, 1);
  assert.equal(proof.survey.phones, 1);
  assert.deepEqual(proof.survey.byDay, [{ day: '2026-10-16', count: 4 }]);

  assert.equal(proof.team.count, 1, 'only real wallet addresses count as team accounts');
  assert.deepEqual(proof.team.accounts, ['0x1234…5678']);

  const text = JSON.stringify(proof);
  for (const secret of ['amara@', 'bola@', 'chidi@', '5550142', '567890abcdef']) {
    assert.equal(text.includes(secret), false, `leaked ${secret}`);
  }
  assert.equal(text.includes('sell_services'), false, 'use cases stay private');
});
