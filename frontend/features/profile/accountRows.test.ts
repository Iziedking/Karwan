import assert from 'node:assert/strict';
import test from 'node:test';
import { accountRows } from './accountRows';

/// The Account rows on Profile say what setup already filled in, instead of
/// "Set up" (owner, 21 Oct 2026).
///
///   npx tsx --test features/profile/accountRows.test.ts

const words = { setUp: 'Set up', telegram: 'Telegram' };

test('nothing set up yet: the rows ask to set up', () => {
  assert.deepEqual(accountRows({}, words), { agents: 'Set up', contact: 'Set up', business: 'Set up' });
});

test('setup answers fill the rows: what you do, how we reach you, the business name', () => {
  assert.deepEqual(
    accountRows({ ownWords: { what: 'Logo and brand design' }, settings: { notifyVia: 'telegram' }, businessDraft: { name: 'Bello Foods', trades: 'rice' } }, words),
    { agents: 'Logo and brand design', contact: 'Telegram', business: 'Bello Foods' },
  );
});

test('an email shows as the contact, and a running business is named by its company', () => {
  const rows = accountRows({ email: 'ada@example.com', settings: { notifyVia: 'both' }, companyName: 'Ada Studio', hasBusiness: true }, words);
  assert.equal(rows.contact, 'ada@example.com');
  assert.equal(rows.business, 'Ada Studio');
});

test('a business that exists without a company name shows nothing, not Set up', () => {
  assert.equal(accountRows({ hasBusiness: true }, words).business, undefined);
});

test('a long description is cut so the row stays one line', () => {
  const what = 'Logo design, brand identity, packaging and social media templates for small shops';
  assert.equal(accountRows({ ownWords: { what } }, words).agents, `${what.slice(0, 32).trimEnd()}…`);
});
