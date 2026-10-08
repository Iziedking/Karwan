import assert from 'node:assert/strict';
import test from 'node:test';
import { mayAnswer } from './safety.js';

test('an answer is held back only when it touches the account without a fresh read', () => {
  assert.equal(mayAnswer({ needsLiveState: false, grounded: false, subjects: 2 }), true);
  assert.equal(mayAnswer({ needsLiveState: true, grounded: true, subjects: 1 }), true);
  assert.equal(mayAnswer({ needsLiveState: true, grounded: false, subjects: 0 }), true);
  assert.equal(mayAnswer({ needsLiveState: true, grounded: false, subjects: 1 }), false);
});

test('thanks, greetings and goodbyes are conversation, not account questions', async () => {
  const { requiresLiveAccountState } = await import('./safety.js');
  const after = (content: string) => [
    { role: 'user' as const, content: 'send 2 usdc to @lawful' },
    { role: 'assistant' as const, content: 'Ready to review.' },
    { role: 'user' as const, content },
  ];
  for (const text of ['thanks', 'Thank you!', 'ok thanks', 'great, thanks', 'hello', 'bye', 'merci', 'asante', 'got it']) {
    assert.equal(requiresLiveAccountState(after(text)), false, text);
  }
  // Still stateful when the thanks carries an account question.
  assert.equal(requiresLiveAccountState(after('thanks, did it go through?')), true);
});

test('an instruction to act on what was just said is not blocked as an account question', async () => {
  const { requiresLiveAccountState } = await import('./safety.js');
  const after = (content: string) => [
    { role: 'user' as const, content: 'I need a game developer to build a game for my website' },
    { role: 'assistant' as const, content: 'What budget and due date should I use?' },
    { role: 'user' as const, content },
  ];
  for (const text of ['Can you post it for me?', 'post it for me', 'yes, go ahead', 'do it', 'please create it', 'Could you set it up?', 'ok proceed']) {
    assert.equal(requiresLiveAccountState(after(text)), false, text);
  }
  // A question about state is still a question about state.
  assert.equal(requiresLiveAccountState(after('did my request post?')), true);
  assert.equal(requiresLiveAccountState(after('what is my balance')), true);
});
