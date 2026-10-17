import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { attestationSettingsCopy } from '@/shared/i18n/messages/attestationSettings';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('settings carry publish on by default, earlier deals off by default, and a remove action behind a confirm', () => {
  const rows = read('./components/PublishDealsRows.tsx');
  assert.match(rows, /checked=\{settings\.publishDeals !== false\}/);
  assert.match(rows, /save\(\{ publishDeals: v \}\)/);
  assert.match(rows, /checked=\{settings\.publishHistory === true\}/);
  assert.match(rows, /save\(\{ publishHistory: v \}\)/);
  assert.match(rows, /<ConfirmSheet[\s\S]*irreversible/);
  assert.match(rows, /confirmLabel=\{copy\.removeConfirm\}/);
  assert.match(read('../deals/workspace/ConfirmSheet.tsx'), /confirmLabel \?\? copy\.confirm/);
  assert.match(rows, /api\.removeMyAttestations\(\)/);
  assert.match(read('./components/SettingsBand.tsx'), /<PublishDealsRows settings=\{settings\} save=\{save\} \/>/);
});

test('every language has every key, without em dashes', () => {
  const en = Object.keys(attestationSettingsCopy.en).sort();
  for (const [locale, copy] of Object.entries(attestationSettingsCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), en, locale);
    assert.doesNotMatch(JSON.stringify(copy), /—/, locale);
  }
  assert.equal(attestationSettingsCopy.en.publishDeals, 'Publish my settled deals');
});

test('the removal result reads correctly for none, one and many', async () => {
  const { removedLine } = await import('./components/PublishDealsRows');
  const c = attestationSettingsCopy.en;
  assert.equal(removedLine(0, c), 'Nothing was published, so nothing to remove.');
  assert.equal(removedLine(1, c), 'Removed 1 statement.');
  assert.equal(removedLine(3, c), 'Removed 3 statements.');
});

test('after a removal the passport list is refreshed at once, not after its cache runs out', () => {
  const rows = read('./components/PublishDealsRows.tsx');
  assert.match(rows, /queryClient\.invalidateQueries\(\{ queryKey: \['attested-deals'\] \}\)/);
});
