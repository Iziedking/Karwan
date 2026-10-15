import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { developersCopy } from '@/shared/i18n/messages/developers';
import { RECORD_READ_EXAMPLE, SCORING } from './content';

const backend = readFileSync(resolve(process.cwd(), '../backend/src/reputation/external.ts'), 'utf-8');
const param = (name: string) => Number(new RegExp(String.raw`\b${name}: ([0-9.]+)`).exec(backend)?.[1]);

test('the published scoring numbers equal the model the backend runs', () => {
  assert.equal(SCORING.halfLifeDays, param('halfLifeDays'));
  assert.equal(SCORING.referenceValueUsd, param('referenceValueUsd'));
  assert.equal(SCORING.perCounterpartyCap, param('perCounterpartyCap'));
  assert.equal(SCORING.z, param('z'));
  assert.equal(SCORING.priorWeight, param('priorWeight'));
  assert.equal(SCORING.priorMean, param('priorMean'));
  assert.equal(SCORING.maxImportedShare, param('maxImportedWeight'));
  assert.equal(SCORING.importedFadeDeals, param('importedFadeDeals'));
  for (const [level, weight] of Object.entries(SCORING.verificationWeight)) {
    assert.match(backend, new RegExp(String.raw`${level}: ${weight}\b`), level);
  }
});

test('the example read has the published shape and no names or amounts', () => {
  assert.equal(RECORD_READ_EXAMPLE.version, 'karwan-record-v1');
  assert.ok(RECORD_READ_EXAMPLE.outcomes.every((o) => /^0x[0-9a-f]{64}$/.test(o.counterparty)));
  assert.doesNotMatch(JSON.stringify(RECORD_READ_EXAMPLE), /amount|name|email|phone/i);
});

test('the page names no other platform and every locale has every key', () => {
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k])).sort();
  for (const loc of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    const text = JSON.stringify(developersCopy[loc]);
    for (const word of ['Upwork', 'Fiverr', 'Jiji', 'Instagram', 'LinkedIn', 'eBay', 'GitHub', 'Etsy', 'Amazon']) assert.ok(!text.includes(word), `${loc} ${word}`);
    assert.doesNotMatch(text, /—/);
    assert.deepEqual(keys(developersCopy[loc]), keys(developersCopy.en), loc);
  }
});
