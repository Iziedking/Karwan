import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MoneyMovement } from '../money/model.js';
import type { DeskDealRow } from './deskDeals.js';
import { accountRow, accountView, type AccountFacts } from './accountView.js';

/// Accounts on the desk (view 79): a person's account as a named allowlist.
///
///   npx tsx --test src/ops/accountView.test.ts

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 12, 12);
const ME = '0xchidi';

function deal(over: Partial<DeskDealRow>): DeskDealRow {
  return {
    jobId: '0xd1', title: 'Logo', buyer: ME, seller: '0xada', buyerTag: 'chidi', sellerTag: 'ada', amountUsdc: '45', origin: 'direct', stage: 'settled',
    parts: 2, createdAt: NOW - 100 * HOUR, disputed: false, dueAt: null, ...over,
  };
}

function move(over: Partial<MoneyMovement>): MoneyMovement {
  return {
    reference: 'KWN-1', operationKey: 'op-secret', kind: 'cash_out', state: 'submitted', version: 1, attempt: 1, currency: 'USDC', amountMicros: '52100000',
    initiatedBy: ME, participants: [], summary: 'summary-secret', nextActor: 'karwan', legs: [], createdAt: NOW - 5 * HOUR, updatedAt: NOW - 5 * HOUR, ...over,
  };
}

function facts(over: Partial<AccountFacts> = {}): AccountFacts {
  return {
    now: NOW,
    profile: {
      address: ME, displayName: 'Chidi Okafor', handle: 'chidi', createdAt: NOW - 60 * 24 * HOUR, email: 'chidi@private.example', emailVerified: true,
      xUserId: 'x-1', location: { country: 'NG', city: 'Lagos', area: 'Yaba' }, settings: { setupDoneAt: NOW - 59 * 24 * HOUR, displayCurrency: 'NGN' },
      taxId: 'tax-secret', circleWalletId: 'wallet-secret',
    } as unknown as AccountFacts['profile'],
    signIn: 'email',
    telegramLinked: true,
    balance: { totalUsdc: 8.08, agentsUsdc: 2 },
    deals: [
      deal({ jobId: '0xa', stage: 'settled', deliveredAt: NOW - 50 * HOUR, deadlineUnix: (NOW - 40 * HOUR) / 1000 }),
      deal({ jobId: '0xb', stage: 'settled', deliveredAt: NOW - 30 * HOUR, deadlineUnix: (NOW - 40 * HOUR) / 1000 }),
      deal({ jobId: '0xc', stage: 'accepted', amountUsdc: '20' }),
      deal({ jobId: '0xd', stage: 'disputed', disputed: true, amountUsdc: '10', buyer: '0xother', seller: ME, buyerTag: 'other' }),
    ],
    moves: [move({ reference: 'KWN-STUCK' }), move({ reference: 'KWN-DONE', state: 'completed', completedAt: NOW - HOUR, amountMicros: '1000000' })],
    cases: [{ ref: 'KS-1042', kind: 'transfer_missing', state: 'waiting_us', updatedAt: NOW - HOUR, subject: 'private subject' }],
    paused: null,
    handleOf: (a) => (a === '0xada' ? 'ada' : null),
    ...over,
  };
}

test('one account keeps only the allowlist: never email, tax ids, wallet ids, summaries or case subjects', () => {
  const text = JSON.stringify(accountView(facts()));
  for (const secret of ['chidi@private.example', 'tax-secret', 'wallet-secret', 'op-secret', 'summary-secret', 'private subject', 'Yaba']) {
    assert.ok(!text.includes(secret), secret);
  }
});

test('one account reads money, record, deals, moves and cases in plain parts', () => {
  const v = accountView(facts());
  assert.equal(v.name, 'Chidi Okafor');
  assert.equal(v.handle, 'chidi');
  assert.equal(v.country, 'NG');
  assert.equal(v.signIn, 'email');
  assert.equal(v.telegramLinked, true);
  assert.deepEqual(v.money, { balanceUsdc: '8.08', heldUsdc: '20', agentsUsdc: '2', stuckUsdc: '52.1', currency: 'NGN' });
  assert.deepEqual(v.record, { dealsDone: 2, onTime: 1, disputes: 1, checked: ['Email', 'X'], agent: null });
  assert.deepEqual(v.moves.map((m) => m.reference), ['KWN-STUCK', 'KWN-DONE']);
  assert.deepEqual(v.deals.map((d) => [d.jobId, d.with]), [['0xa', '@ada'], ['0xb', '@ada'], ['0xc', '@ada'], ['0xd', '@other']]);
  assert.deepEqual(v.cases, [{ ref: 'KS-1042', kind: 'transfer_missing', state: 'waiting_us', lastAt: NOW - HOUR }]);
  assert.equal(v.status, 'money_stuck');
  assert.equal(v.paused, null);
  assert.equal(v.accountType, 'person');
  assert.equal(v.business, 'none');
});

test('a business account says how far its check went', () => {
  const profile = { ...facts().profile, accountType: 'business', business: { status: 'submitted' } } as unknown as AccountFacts['profile'];
  const v = accountView(facts({ profile }));
  assert.equal(v.accountType, 'business');
  assert.equal(v.business, 'submitted');
});

test('a balance that could not be read says so, rather than zero', () => {
  assert.equal(accountView(facts({ balance: null })).money.balanceUsdc, null);
});

test('a paused account says who paused it and when, and reads paused before anything else', () => {
  const v = accountView(facts({ paused: { at: NOW - HOUR, by: 'Tobi Martins' } }));
  assert.deepEqual(v.paused, { at: NOW - HOUR, by: 'Tobi Martins' });
  assert.equal(v.status, 'paused');
});

test('a list row is short: who, where from, when, deals, disputes and one status', () => {
  const row = accountRow({ profile: facts().profile, deals: 4, disputes: 1, stuck: false, pausedAt: null });
  assert.deepEqual(row, { address: ME, name: 'Chidi Okafor', handle: 'chidi', joinedAt: NOW - 60 * 24 * HOUR, country: 'NG', deals: 4, disputes: 1, status: 'active' });
  const settingUp = { ...facts().profile, settings: {} } as AccountFacts['profile'];
  assert.equal(accountRow({ profile: settingUp, deals: 0, disputes: 0, stuck: false, pausedAt: null }).status, 'setting_up');
  assert.equal(accountRow({ profile: settingUp, deals: 0, disputes: 0, stuck: true, pausedAt: null }).status, 'money_stuck');
  assert.equal(accountRow({ profile: settingUp, deals: 0, disputes: 0, stuck: true, pausedAt: NOW }).status, 'paused');
});
