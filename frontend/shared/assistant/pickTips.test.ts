import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assistantTipsCopy } from '../i18n/messages/assistantTips';
import { pickTips, tipKindFor } from './pickTips';

const en = assistantTipsCopy.en;

test('the page picks the kind first', () => {
  assert.equal(pickTips('/deals/0xabc', 0, en)[0]!.kind, 'deal');
  assert.equal(pickTips('/send', 0, en)[0]!.kind, 'money');
  assert.equal(pickTips('/settings', 0, en)[0]!.kind, 'safety');
  assert.equal(pickTips('/record/x', 0, en)[0]!.kind, 'record');
  assert.equal(tipKindFor('/market'), null);
  assert.equal(tipKindFor(null), null);
});

test('all tips come back once', () => {
  const all = Object.values(en).flat();
  const picked = pickTips('/deals', 3, en).map((t) => t.text);
  assert.equal(picked.length, all.length);
  assert.equal(new Set(picked).size, all.length);
});

test('the seed rotates', () => {
  assert.notEqual(pickTips('/deals', 0, en)[0]!.text, pickTips('/deals', 1, en)[0]!.text);
  assert.notEqual(pickTips(null, 0, en)[0]!.text, pickTips(null, 1, en)[0]!.text);
});

test('tips stay short and plain', () => {
  for (const [locale, kinds] of Object.entries(assistantTipsCopy)) {
    for (const [kind, tips] of Object.entries(kinds)) {
      assert.ok(tips.length >= 6, `${locale} ${kind}`);
      for (const tip of tips) {
        assert.ok(tip.length < (locale === 'en' ? 90 : 140), `${locale}: ${tip}`);
        assert.equal(/\d/.test(tip), false, `${locale}: ${tip}`);
        assert.equal(tip.includes('—'), false, `${locale}: ${tip}`);
      }
    }
  }
});

test('the backend list matches', () => {
  const file = resolve(process.cwd(), '..', 'backend', 'src', 'channels', 'waitTips.json');
  const backend = JSON.parse(readFileSync(file, 'utf8')) as { deal: string[]; safety: string[] };
  assert.deepEqual(backend, { deal: en.deal, safety: en.safety });
});
