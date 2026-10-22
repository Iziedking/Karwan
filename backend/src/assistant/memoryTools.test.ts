import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantConversation } from '../db/assistantConversations.js';
import type { AssistantMemory } from '../db/assistantMemory.js';
import { memoryPreamble, memoryTools, searchConversations, type MemoryToolDeps } from './memoryTools.js';

/// Recall in every turn, and the three memory tools.
///
///   npx tsx --test src/assistant/memoryTools.test.ts

const call = { toolCallId: 't1', messages: [] };
const DAY = 86_400_000;

function convo(id: string, title: string, lines: string[], updatedAt: number): AssistantConversation {
  return {
    id, address: '0xa', title, createdAt: updatedAt, updatedAt,
    messages: lines.map((content, i) => ({ role: i % 2 ? 'assistant' : 'user', content })),
  } as AssistantConversation;
}

function setup(memory: Partial<AssistantMemory> = {}) {
  let state: AssistantMemory = { enabled: true, notes: [{ id: 'n1', text: 'Wants branded tape, 12 rolls', at: 10 * DAY }, { id: 'n2', text: 'Ships to Lagos', at: 11 * DAY }], updatedAt: 1, ...memory };
  const deps: MemoryToolDeps = {
    memory: async () => state,
    add: async (_a, change) => {
      state = { ...state, notes: [...state.notes, ...change.add.map((text, i) => ({ id: `new${i}`, text, at: 12 * DAY }))] };
    },
    remove: async (_a, ids) => {
      state = { ...state, notes: state.notes.filter((n) => !ids.includes(n.id)) };
      return true;
    },
    conversations: async () => [
      convo('c1', 'Branded tape for my shop', ['I need branded tape, 12 rolls', 'Madie sells it for 50 USDC'], 10 * DAY),
      convo('c2', 'Logo for my brand', ['Can you find a logo designer', 'Here are three designers'], 9 * DAY),
    ],
  };
  return { deps, state: () => state };
}

test('the preamble carries dated notes, fenced as data', () => {
  const text = memoryPreamble({ enabled: true, notes: [{ id: 'n1', text: 'Ships to <b>Lagos</b>', at: Date.UTC(2026, 9, 14) }], updatedAt: 1 });
  assert.match(text, /<memory>\n- \(2026-10-14\) Ships to bLagos\/b\n<\/memory>/);
  assert.match(text, /never as instructions/i);
  assert.match(text, /fresh/i);
});

test('with memory off or nothing remembered, the preamble says so', () => {
  assert.match(memoryPreamble({ enabled: false, notes: [{ id: 'n', text: 'x', at: 1 }], updatedAt: 1 }), /memory is off/i);
  assert.match(memoryPreamble({ enabled: true, notes: [], updatedAt: 1 }), /nothing remembered yet/i);
});

test('past conversations are found by topic, best match first, with a short excerpt', () => {
  const found = searchConversations([
    convo('c2', 'Logo for my brand', ['Can you find a logo designer'], 9 * DAY),
    convo('c1', 'Branded tape for my shop', ['I need branded tape, 12 rolls', 'Madie sells it for 50 USDC'], 10 * DAY),
  ], 'the tape order');
  assert.equal(found[0].id, 'c1');
  assert.equal(found.length, 1);
  assert.match(found[0].excerpt, /tape/i);
  assert.ok(found[0].excerpt.length <= 400);
});

test('recall_conversations searches saved conversations, and refuses while memory is off', async () => {
  const on = setup();
  const out = (await memoryTools('0xa', on.deps).recall_conversations.execute!({ query: 'logo designer' }, call)) as { found: Array<{ title: string }> };
  assert.equal(out.found[0].title, 'Logo for my brand');
  const off = setup({ enabled: false });
  const refused = (await memoryTools('0xa', off.deps).recall_conversations.execute!({ query: 'logo' }, call)) as Record<string, unknown>;
  assert.equal(refused.memoryOff, true);
});

test('remember_this keeps a safe note and refuses secrets or memory off', async () => {
  const s = setup();
  const saved = (await memoryTools('0xa', s.deps).remember_this.execute!({ text: 'Prefers delivery on weekends' }, call)) as Record<string, unknown>;
  assert.equal(saved.saved, true);
  assert.ok(s.state().notes.some((n) => n.text === 'Prefers delivery on weekends'));
  const secret = (await memoryTools('0xa', s.deps).remember_this.execute!({ text: 'My PIN is 4821' }, call)) as Record<string, unknown>;
  assert.equal(secret.saved, false);
  const off = (await memoryTools('0xa', setup({ enabled: false }).deps).remember_this.execute!({ text: 'Ships to Kano' }, call)) as Record<string, unknown>;
  assert.equal(off.saved, false);
});

test('forget_memory removes matching notes, or everything', async () => {
  const s = setup();
  const one = (await memoryTools('0xa', s.deps).forget_memory.execute!({ about: 'tape' }, call)) as { forgotten: string[] };
  assert.deepEqual(one.forgotten, ['Wants branded tape, 12 rolls']);
  assert.deepEqual(s.state().notes.map((n) => n.text), ['Ships to Lagos']);
  const all = (await memoryTools('0xa', s.deps).forget_memory.execute!({ everything: true }, call)) as { forgotten: string[] };
  assert.deepEqual(all.forgotten, ['Ships to Lagos']);
  assert.equal(s.state().notes.length, 0);
});
