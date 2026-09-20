import assert from 'node:assert/strict';
import test from 'node:test';
import { en } from '../../../shared/i18n/messages/en.js';
import { actionLabel, actorLabel, automaticLine, fill, formatUsdcAmount, trustFactParts } from './presentation.js';
import type { TrustCardView } from '../../../core/api.js';

const copy = en.dealWorkspace;

test('templates fill every placeholder', () => {
  assert.equal(fill('{amount} USDC goes to {name}.', { amount: '600', name: 'Amina' }), '600 USDC goes to Amina.');
});

test('amounts are grouped and keep up to six decimals', () => {
  assert.equal(formatUsdcAmount('12400', 'en'), '12,400');
  assert.equal(formatUsdcAmount('33.165', 'en'), '33.165');
});

test('the primary button says exactly what happens', () => {
  assert.equal(actionLabel({ action: 'release', actor: 'you', amountUsdc: '600' }, copy, 'en'), 'Release 600 USDC');
  assert.equal(actionLabel({ action: 'accept', actor: 'you', amountUsdc: null }, copy, 'en'), 'Accept the agreement');
  assert.equal(actionLabel({ action: null, actor: 'counterparty', amountUsdc: null }, copy, 'en'), null);
});

test('whose move it is, in words', () => {
  assert.equal(actorLabel({ action: 'fund', actor: 'you', amountUsdc: '1' }, 'Amina', copy), 'Your move');
  assert.equal(actorLabel({ action: null, actor: 'counterparty', amountUsdc: null }, 'Amina', copy), 'Waiting on Amina');
  assert.equal(actorLabel({ action: null, actor: 'nobody', amountUsdc: null }, 'Amina', copy), 'No action needed');
});

test('trust facts show what exists and hide what does not apply', () => {
  const card: TrustCardView = {
    role: 'seller', name: 'Amina', verifiedBusiness: false, verifiedPerson: false,
    facts: { settled: 14, distinctCounterparties: 9, onTime: 13, withDeadline: 14, disputes: 0 },
    memberSince: Date.UTC(2026, 2, 1), stakeUsdc: null, provenAccounts: [], isNew: false,
  };
  assert.deepEqual(trustFactParts(card, copy, 'en'), ['14 settled', '13 of 14 on time', '0 disputes', 'since Mar 2026']);
  const buyer: TrustCardView = { ...card, role: 'buyer', facts: { ...card.facts, withDeadline: 0 } };
  assert.equal(trustFactParts(buyer, copy, 'en').some((part) => part.includes('on time')), false);
});

test('the automatic outcome names its date', () => {
  const line = automaticLine({
    stage: 'awaiting-first-release', money: { line: 'held' }, progress: [],
    next: { action: 'release', actor: 'you', amountUsdc: '600' },
    automatic: { kind: 'auto-release', at: Date.UTC(2026, 8, 25, 9, 0) },
  }, copy, 'en');
  assert.equal(line, 'Releases automatically on 25 Sep 2026 unless the buyer disputes.');
});
