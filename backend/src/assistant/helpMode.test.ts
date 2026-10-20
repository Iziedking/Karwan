import assert from 'node:assert/strict';
import test from 'node:test';
import { chatBodySchema } from './chatBody.js';
import { HELP_MODE_NOTE, systemPromptFor } from './knowledge.js';

/// Help answers from what the assistant can see, and a person joins only when
/// asked for, or when the assistant cannot do it (owner, 20 Oct 2026).
///
///   npx tsx --test src/assistant/helpMode.test.ts

test('the help paragraph is in the prompt only when Help is open', () => {
  assert.ok(systemPromptFor({ mode: 'help' }).includes(HELP_MODE_NOTE));
  assert.ok(!systemPromptFor({ mode: 'assistant' }).includes(HELP_MODE_NOTE));
  assert.ok(!systemPromptFor({}).includes(HELP_MODE_NOTE));
  assert.match(HELP_MODE_NOTE, /The person opened Help/);
});

test('a person is brought in only when asked for or when the assistant cannot do it', () => {
  const prompt = systemPromptFor({});
  assert.match(prompt, /only when they ask for one, or when you cannot do or answer it/);
  assert.match(prompt, /When you can see the state.*answer with those facts and do not offer a person/s);
  assert.doesNotMatch(prompt, /unresolved payment, account or dispute problem, offer Talk to a human/);
});

test('the chat body accepts help or assistant mode and nothing else', () => {
  const messages = [{ role: 'user', content: 'hi' }];
  assert.equal(chatBodySchema.safeParse({ messages }).success, true);
  assert.equal(chatBodySchema.safeParse({ messages, mode: 'help' }).success, true);
  assert.equal(chatBodySchema.safeParse({ messages, mode: 'assistant' }).success, true);
  assert.equal(chatBodySchema.safeParse({ messages, mode: 'admin' }).success, false);
});
