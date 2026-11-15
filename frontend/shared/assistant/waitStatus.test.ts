import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assistantWaitCopy } from '../i18n/messages/assistantWait';
import { statusLine } from './waitStatus';

const en = assistantWaitCopy.en;

test('own line first', () => {
  assert.equal(statusLine({ kind: 'status', tool: 'get_my_balance' }, en), 'Reading your balance');
  assert.equal(statusLine({ kind: 'status', tool: 'get_deal_status' }, en), 'Checking your deal');
});

test('prefixes', () => {
  assert.equal(statusLine({ kind: 'status', tool: 'propose_release' }, en), 'Preparing the card');
  assert.equal(statusLine({ kind: 'status', tool: 'get_my_skills' }, en), 'Looking it up');
  assert.equal(statusLine({ kind: 'status', tool: 'list_my_payment_links' }, en), 'Looking it up');
  assert.equal(statusLine({ kind: 'status', tool: 'brand_new_tool' }, en), 'Working on it');
});

test('before a step and on a retry', () => {
  assert.equal(statusLine(null, en), 'Reading your message');
  assert.equal(statusLine({ kind: 'retrying' }, en), 'Checking that against your account');
});

/// The assistant's tools, read from the backend source.
function toolNames(): string[] {
  const dir = resolve(process.cwd(), '..', 'backend', 'src', 'assistant');
  const names = new Set<string>();
  for (const file of ['agent.ts', 'supportTools.ts']) {
    const src = readFileSync(resolve(dir, file), 'utf8');
    for (const m of src.matchAll(/^\s{2,4}([a-z_]+): tool\(/gm)) names.add(m[1]!);
  }
  return [...names];
}

test('every tool has a line', () => {
  const names = toolNames();
  assert.ok(names.length >= 65, `found ${names.length} tools`);
  const covered = (name: string) => name in en.tools || /^(propose|get|list|whats)_/.test(name);
  assert.deepEqual(names.filter((n) => !covered(n)), []);
});

test('every locale has every line', () => {
  const keys = Object.keys(en.tools).sort();
  for (const [locale, copy] of Object.entries(assistantWaitCopy)) {
    assert.deepEqual(Object.keys(copy.tools).sort(), keys, locale);
    for (const [key, line] of Object.entries(copy.tools)) assert.ok(line.trim(), `${locale} ${key}`);
    for (const line of [copy.first, copy.retrying, copy.groups.propose, copy.groups.read, copy.groups.other, ...Object.values(copy.tipLabels)]) {
      assert.ok(line.trim(), locale);
      assert.equal(line.includes('—'), false, `${locale}: ${line}`);
    }
  }
});
