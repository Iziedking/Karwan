import assert from 'node:assert/strict';
import test from 'node:test';
import type { Reputation, SealedReputation } from '@/core/api';
import { payLinkCopy } from '@/shared/i18n/messages/payLink';
import { personRecordLine } from './personRecordLine';

///   npx tsx --test shared/components/personRecordLine.test.ts

const copy = payLinkCopy.en.pay;
const open = (successCount: number) => ({ open: { tier: 'COLD', successCount } as Reputation });

test('beside a name it says how many deals, never the tier', () => {
  assert.equal(personRecordLine(open(3), copy), '3 deals');
  assert.equal(personRecordLine(open(1), copy), '1 deal');
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    assert.doesNotMatch(personRecordLine(open(4), payLinkCopy[locale].pay)!, /\{tier\}|COLD/, locale);
  }
});

test('no settled deal or no record reads as new', () => {
  assert.equal(personRecordLine(open(0), copy), 'New on Karwan');
  assert.equal(personRecordLine(null, copy), 'New on Karwan');
  assert.equal(personRecordLine({ sealed: { tier: 'NEW' } as SealedReputation }, copy), 'New on Karwan');
});

test('a sealed record adds nothing beside the name', () => {
  assert.equal(personRecordLine({ sealed: { tier: 'STRONG' } as SealedReputation }, copy), null);
});
