import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { canReadPrivate, isPublic, sellerAgentMaySee } from './visibility.js';

const BUYER = '0xbuyer';
const ASKED = '0xasked';
const OTHER = '0xother';
const invited = { visibility: 'invited' as const, buyer: BUYER, invited: [ASKED] };

test('only the market, or nothing said, is public; invited never is (view 72)', () => {
  assert.equal(isPublic({}), true);
  assert.equal(isPublic({ visibility: 'market' }), true);
  assert.equal(isPublic({ visibility: 'agents' }), false);
  assert.equal(isPublic({ visibility: 'invited' }), false);
});

test('an invited request is read by its buyer and the people asked, nobody else', () => {
  assert.equal(canReadPrivate(invited, BUYER), true);
  assert.equal(canReadPrivate(invited, ASKED.toUpperCase()), true);
  assert.equal(canReadPrivate(invited, OTHER), false);
  assert.equal(canReadPrivate(invited, null), false);
});

test('a request for agents keeps its rule: the buyer, and sellers who offered on it', () => {
  const agents = { visibility: 'agents' as const, buyer: BUYER };
  assert.equal(canReadPrivate(agents, BUYER), true);
  assert.equal(canReadPrivate(agents, OTHER), false);
  assert.equal(canReadPrivate(agents, OTHER, { offered: true }), true);
});

test('only the agents of the people asked may see an invited request; other requests are as before', () => {
  assert.equal(sellerAgentMaySee(invited, ASKED), true);
  assert.equal(sellerAgentMaySee(invited, OTHER), false);
  assert.equal(sellerAgentMaySee({ visibility: 'agents' }, OTHER), true);
  assert.equal(sellerAgentMaySee({}, OTHER), true);
});

test('no file decides what is public by naming one kind of private (view 72)', () => {
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== 'node_modules') walk(path);
        continue;
      }
      if (!name.endsWith('.ts') || name.endsWith('.test.ts') || name === 'visibility.ts') continue;
      const text = readFileSync(path, 'utf8');
      if (/visibility\s*!==\s*'agents'|visibility\s*===\s*'agents'\s*\?\s*\('agents'/.test(text)) offenders.push(path);
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
