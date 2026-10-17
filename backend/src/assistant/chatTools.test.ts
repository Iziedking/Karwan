import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoredFact } from '../verification/evidence.js';
import { ladderFor } from '../verification/ladder.js';
import { chatTools, type ChatToolDeps } from './chatTools.js';

/// Links people add as self-added evidence, and muting alerts from chat.
///
///   npx tsx --test src/assistant/chatTools.test.ts

const ADA = '0x00000000000000000000000000000000000000ad';
const call = { toolCallId: 't1', messages: [] };
const NOW = 1_760_000_000_000;

function setup() {
  const facts: StoredFact[] = [];
  let muted = false;
  const deps: ChatToolDeps = {
    now: () => NOW,
    newId: () => `f${facts.length + 1}`,
    getFacts: async () => facts,
    addFact: async (_a, f) => {
      if (facts.some((x) => x.evidenceHash === f.evidenceHash && x.kind === f.kind)) return false;
      facts.push(f);
      return true;
    },
    setMuted: async (_a, m) => {
      muted = m;
    },
  };
  return { tools: chatTools(ADA, deps), facts, muted: () => muted };
}

test('a shared link is stored as self-reported and does not change the level', async () => {
  const s = setup();
  const before = ladderFor(s.facts, NOW);
  const out = (await s.tools.add_my_link.execute!({ url: 'https://instagram.com/ada.shop' }, call)) as { saved: boolean; note: string };
  assert.equal(out.saved, true);
  assert.match(out.note, /only verified items raise your score/);
  assert.equal(s.facts.length, 1);
  assert.equal(s.facts[0]!.kind, 'shared_link');
  assert.equal(s.facts[0]!.level, 'self_reported');
  assert.equal(s.facts[0]!.source, 'chat');
  assert.equal(s.facts[0]!.expiresAt, NOW + 365 * 24 * 60 * 60 * 1000);
  assert.equal(ladderFor(s.facts, NOW), before);
});

test('the same link twice is saved once', async () => {
  const s = setup();
  await s.tools.add_my_link.execute!({ url: 'https://instagram.com/ada.shop' }, call);
  const again = (await s.tools.add_my_link.execute!({ url: 'https://INSTAGRAM.com/ada.shop/' }, call)) as { saved: boolean };
  assert.equal(again.saved, false);
  assert.equal(s.facts.length, 1);
});

test('a link that is not https is refused', async () => {
  const s = setup();
  const out = (await s.tools.add_my_link.execute!({ url: 'http://ada.shop' }, call)) as { saved: boolean; error?: string };
  assert.equal(out.saved, false);
  assert.match(out.error ?? '', /https/);
  assert.equal(s.facts.length, 0);
});

test('no more than 20 links are kept', async () => {
  const s = setup();
  for (let i = 0; i < 20; i++) await s.tools.add_my_link.execute!({ url: `https://example.com/${i}` }, call);
  const out = (await s.tools.add_my_link.execute!({ url: 'https://example.com/21' }, call)) as { saved: boolean };
  assert.equal(out.saved, false);
  assert.equal(s.facts.length, 20);
});

test('alerts turn off and back on', async () => {
  const s = setup();
  assert.deepEqual(await s.tools.set_chat_alerts.execute!({ on: false }, call), { alerts: 'off' });
  assert.equal(s.muted(), true);
  assert.deepEqual(await s.tools.set_chat_alerts.execute!({ on: true }, call), { alerts: 'on' });
  assert.equal(s.muted(), false);
});
