import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminAccountRow } from '@/core/api';
import { ACCOUNT_STATUS, ACCOUNT_VIEWS, accountsShown, looksLikeEmail, recordLine } from './accountsPresentation';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 12, 12);

function row(over: Partial<AdminAccountRow>): AdminAccountRow {
  return { address: '0xaaa', name: 'Amaka Eze', handle: 'amaka', joinedAt: NOW - 30 * DAY, country: 'NG', deals: 1, disputes: 0, status: 'active', ...over };
}

const rows = [
  row({ address: '0x1', name: 'Chidi Okafor', handle: 'chidi', status: 'money_stuck' }),
  row({ address: '0x2', joinedAt: NOW - 2 * DAY }),
  row({ address: '0x3', name: 'Tunde Bello', handle: 'tunde', status: 'setting_up', joinedAt: NOW - DAY }),
  row({ address: '0x4', name: 'Ifeoma Nwosu', handle: null, status: 'paused' }),
];

test('the lists are All, Money stuck, New this week, Setting up and Paused', () => {
  assert.deepEqual(ACCOUNT_VIEWS.map((v) => v.label), ['All', 'Money stuck', 'New this week', 'Setting up', 'Paused']);
  assert.deepEqual(accountsShown(rows, 'all', '', NOW).map((r) => r.address), ['0x1', '0x2', '0x3', '0x4']);
  assert.deepEqual(accountsShown(rows, 'stuck', '', NOW).map((r) => r.address), ['0x1']);
  assert.deepEqual(accountsShown(rows, 'new', '', NOW).map((r) => r.address), ['0x2', '0x3']);
  assert.deepEqual(accountsShown(rows, 'paused', '', NOW).map((r) => r.address), ['0x4']);
});

test('search finds a name, a tag or an address across every list', () => {
  assert.deepEqual(accountsShown(rows, 'paused', '@chidi', NOW).map((r) => r.address), ['0x1']);
  assert.deepEqual(accountsShown(rows, 'paused', 'tunde', NOW).map((r) => r.address), ['0x3']);
  assert.deepEqual(accountsShown(rows, 'paused', '0x2', NOW).map((r) => r.address), ['0x2']);
});

test('an email in the search asks the server instead', () => {
  assert.equal(looksLikeEmail('chidi@example.com'), true);
  assert.equal(looksLikeEmail('@chidi'), false);
});

test('each status has plain words and a tone', () => {
  assert.deepEqual(ACCOUNT_STATUS.money_stuck, { label: 'Money stuck', tone: 'red' });
  assert.deepEqual(ACCOUNT_STATUS.paused, { label: 'Paused', tone: 'amber' });
  assert.deepEqual(ACCOUNT_STATUS.setting_up, { label: 'Setting up', tone: 'grey' });
  assert.deepEqual(ACCOUNT_STATUS.active, { label: 'Active', tone: 'green' });
});

test('the record reads as one line', () => {
  assert.equal(recordLine({ dealsDone: 4, onTime: 4 }), '4 deals, all on time');
  assert.equal(recordLine({ dealsDone: 4, onTime: 3 }), '4 deals, 3 on time');
  assert.equal(recordLine({ dealsDone: 1, onTime: 1 }), '1 deal, on time');
  assert.equal(recordLine({ dealsDone: 0, onTime: 0 }), 'No deals yet');
});
