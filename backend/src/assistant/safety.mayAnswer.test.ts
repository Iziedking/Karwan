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
