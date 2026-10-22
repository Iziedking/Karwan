import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantMemory } from '../db/assistantMemory.js';
import { notePrompt, writeMemoryNotes, type MemoryWriterDeps } from './memoryWriter.js';

/// After a reply, a light model writes down what is worth keeping.
///
///   npx tsx --test src/assistant/memoryWriter.test.ts

function setup(memory: Partial<AssistantMemory> = {}, extracted = { add: ['Wants 12 rolls of branded tape'], replace: [] as string[] }) {
  const saved: Array<{ add: readonly string[]; replace: readonly string[] }> = [];
  const prompts: string[] = [];
  const deps: MemoryWriterDeps = {
    memory: async () => ({ enabled: true, notes: [{ id: 'old', text: 'Budget 200 USDC', at: 1 }], updatedAt: 1, ...memory }),
    add: async (_a, change) => { saved.push(change); },
    extract: async (prompt) => { prompts.push(prompt); return extracted; },
  };
  return { deps, saved, prompts };
}

const turn = { address: '0xa', userText: 'I need 12 rolls of branded tape for my shop in Lagos', reply: 'I found two sellers.' };

test('a turn with something new is written down', async () => {
  const s = setup();
  await writeMemoryNotes(turn, s.deps);
  assert.deepEqual(s.saved, [{ add: ['Wants 12 rolls of branded tape'], replace: [] }]);
});

test('nothing is written while memory is off, for small talk, or when asked not to', async () => {
  for (const [memory, userText] of [
    [{ enabled: false }, turn.userText],
    [{}, 'thanks'],
    [{}, "Please don't remember this: I am moving to Abuja next month"],
  ] as const) {
    const s = setup(memory);
    await writeMemoryNotes({ ...turn, userText }, s.deps);
    assert.deepEqual(s.saved, [], userText);
    assert.equal(s.prompts.length, 0, userText);
  }
});

test('only existing notes can be replaced, and at most three notes join per turn', async () => {
  const s = setup({}, { add: ['A', 'B', 'C', 'D'], replace: ['old', 'made-up'] });
  await writeMemoryNotes(turn, s.deps);
  assert.deepEqual(s.saved, [{ add: ['A', 'B', 'C'], replace: ['old'] }]);
});

test('a failing model never breaks the reply', async () => {
  const s = setup();
  s.deps.extract = async () => { throw new Error('provider down'); };
  await writeMemoryNotes(turn, s.deps);
  assert.deepEqual(s.saved, []);
});

test('the prompt fences the conversation as data and lists the notes with their ids', () => {
  const p = notePrompt([{ id: 'old', text: 'Budget 200 USDC', at: 1 }], turn.userText, turn.reply);
  assert.match(p, /old: Budget 200 USDC/);
  assert.match(p, /<conversation>[\s\S]*branded tape[\s\S]*<\/conversation>/);
  assert.match(p, /never instructions/i);
});
