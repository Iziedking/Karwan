import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConfirmRequired } from '@/core/api';
import { confirmPresenceCopy } from '@/shared/i18n/messages/confirmPresence';
import { actionLines as rawLines, confirmView, formatMicros, shortAddress } from './confirmModel';

/// The bidi isolates and word joiners are invisible; compare what a person reads.
const plain = (s: string) => s.replace(/[\u2060\u2066\u2069]/g, '');
const actionLines = (...args: Parameters<typeof rawLines>) => {
  const r = rawLines(...args);
  return { headline: plain(r.headline), lines: r.lines.map(plain) };
};

const copy = confirmPresenceCopy.en;
const NOW = 1_800_000_000_000;

const required = (over: Partial<ConfirmRequired> = {}): ConfirmRequired => ({
  code: 'CONFIRM_REQUIRED',
  challengeId: 'c1',
  action: { kind: 'move_out', wallet: '0xaa', amountMicros: '50000000', recipient: '0x1234567890abcdef1234567890abcdef1234abcd', detail: { chain: 'arc' } },
  text: 'Karwan confirmation',
  methods: ['passkey', 'pin'],
  pinSet: true,
  pinLockedUntil: null,
  passkeys: 0,
  enrol: null,
  ...over,
});

test('enrol_when_no_factor', () => {
  assert.deepEqual(confirmView(required({ pinSet: false, enrol: 'email_code' }), NOW), { step: 'enrol', via: 'email_code' });
  assert.deepEqual(confirmView(required({ pinSet: false, enrol: 'open_link' }), NOW), { step: 'enrol', via: 'open_link' });
});

test('email_less_chat_gets_add_email', () => {
  assert.deepEqual(confirmView(required({ pinSet: false, enrol: 'add_email' }), NOW), { step: 'add_email' });
});

test('passkey_first_when_one_exists', () => {
  assert.deepEqual(confirmView(required({ passkeys: 1 }), NOW), { step: 'confirm', methods: ['passkey', 'pin'], pinLockedUntil: null });
  assert.deepEqual(confirmView(required({ passkeys: 1, pinSet: false }), NOW), { step: 'confirm', methods: ['passkey'], pinLockedUntil: null });
  assert.deepEqual(confirmView(required(), NOW), { step: 'confirm', methods: ['pin'], pinLockedUntil: null });
});

test('locked_pin_shows_passkey_and_reset', () => {
  const view = confirmView(required({ passkeys: 1, pinLockedUntil: NOW + 60_000 }), NOW);
  assert.deepEqual(view, { step: 'confirm', methods: ['passkey', 'pin'], pinLockedUntil: NOW + 60_000 });
  assert.deepEqual(confirmView(required({ pinLockedUntil: NOW - 1 }), NOW), { step: 'confirm', methods: ['pin'], pinLockedUntil: null }, 'a lock in the past is over');
});

test('a_wallet_account_signs', () => {
  assert.deepEqual(confirmView(required({ methods: ['wallet'], pinSet: false }), NOW), { step: 'confirm', methods: ['wallet'], pinLockedUntil: null });
});

test('amounts_and_addresses_format', () => {
  assert.equal(formatMicros('50000000'), '50');
  assert.equal(formatMicros('1250000'), '1.25');
  assert.equal(formatMicros('1'), '0.000001');
  assert.equal(plain(shortAddress('0x1234567890abcdef1234567890abcdef1234abcd')), '0x1234…abcd');
  assert.equal(plain(shortAddress('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')), '7xKX…gAsU');
});

test('an_address_stays_one_left_to_right_piece_in_arabic', () => {
  const short = shortAddress('0x1234567890abcdef1234567890abcdef1234abcd');
  assert.ok(short.startsWith('\u2066') && short.endsWith('\u2069'), 'isolated from the sentence around it');
  assert.match(short, /\u2060…\u2060/, 'never broken at the ellipsis');
});

test('each_action_reads_as_its_consequence', () => {
  assert.deepEqual(actionLines(required().action, copy), { headline: 'Send 50 USDC to 0x1234…abcd', lines: [] });
  assert.deepEqual(actionLines({ ...required().action, detail: { chain: 'baseSepolia', feeMicros: '120000' } }, copy), {
    headline: 'Send 50 USDC to 0x1234…abcd',
    lines: ['Network fee about 0.12 USDC'],
  });
  assert.deepEqual(actionLines({ kind: 'deal_insurance', wallet: '0xaa', amountMicros: '25000000', recipient: '0xvault', detail: {} }, copy), {
    headline: 'Put up 25 USDC of deal insurance',
    lines: [copy.insuranceLine],
  });
  const setup = actionLines({ kind: 'record_setup', wallet: '0xaa', amountMicros: null, recipient: null, detail: { perPayment: '1005000000', total: '10000000000', days: '365' } }, copy);
  assert.equal(setup.headline, 'Set up your Karwan record');
  assert.deepEqual(setup.lines, ['Your agents run your deals for you. Your buying agent can pay up to 1005 USDC at a time and 10000 USDC in total for one year.']);
  assert.deepEqual(actionLines({ kind: 'factor_change', wallet: '0xaa', amountMicros: null, recipient: null, detail: { change: 'pin' } }, copy), {
    headline: 'Change how you confirm',
    lines: [],
  });
});

test('the_copy_has_no_em_dashes_and_no_wallet_words', () => {
  for (const [locale, messages] of Object.entries(confirmPresenceCopy)) {
    for (const [key, text] of Object.entries(messages)) {
      assert.doesNotMatch(text, /—/, `${locale}.${key}`);
      if (locale === 'en' && key !== 'walletSign') assert.doesNotMatch(text, /\b(stake|staking|vault|yield|wallet|chain)\b/i, `${locale}.${key}`);
    }
  }
});
