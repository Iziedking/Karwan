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

test('asking to open a deal with someone is an instruction, so the questions that build it are answered', async () => {
  const { requiresLiveAccountState } = await import('./safety.js');
  const ask = (content: string) => [{ role: 'user' as const, content }];
  for (const text of [
    'open a deal with @lawful for 3 logo designs',
    'start a protected deal with @ada',
    'create a deal with bola@example.com for a brand kit',
    'I want to make a deal with @tunde',
    'set up an escrow deal with @kingizie for 80 usdc',
  ]) {
    assert.equal(requiresLiveAccountState(ask(text)), false, text);
  }
  // Questions about deals that already exist still need a fresh read.
  assert.equal(requiresLiveAccountState(ask('what is the status of my deal with @lawful?')), true);
  assert.equal(requiresLiveAccountState(ask('did the deal with @ada go through?')), true);
});

test('wanting a first or new deal is the start of building one, not an account question', async () => {
  const { requiresLiveAccountState } = await import('./safety.js');
  const ask = (content: string) => [{ role: 'user' as const, content }];
  for (const text of [
    'I want to make my first deal',
    'help me make my first deal',
    'start a deal',
    'I want to start a new deal',
    'open a protected deal',
    'how do I make my first deal?',
  ]) {
    assert.equal(requiresLiveAccountState(ask(text)), false, text);
  }
  // Deals that already exist are still read first.
  for (const text of ['did my first deal go through?', 'what is the status of my deal?', 'show my deals', 'is my new deal funded?']) {
    assert.equal(requiresLiveAccountState(ask(text)), true, text);
  }
});

test('a short answer while a deal is being built is part of building it', async () => {
  const { requiresLiveAccountState } = await import('./safety.js');
  const build = (...turns: string[]) => turns.map((content, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content }));
  const asked = ['Open a deal with grachi for delivery of books', 'Found them: @grachidefi. What is the budget in USDC and when do you need them?'];
  for (const answer of ['20 usdc', '20', 'next friday', 'in 5 days', '@grachidefi', 'two payments']) {
    assert.equal(requiresLiveAccountState(build(...asked, answer)), false, answer);
  }
  // Asking about the account mid-build still needs a fresh read.
  assert.equal(requiresLiveAccountState(build(...asked, 'what is my balance?')), true);
  assert.equal(requiresLiveAccountState(build(...asked, 'did it go through?')), true);
  // Without a question pending, an old deal request does not relax later turns.
  assert.equal(requiresLiveAccountState(build('Open a deal with grachi for books', 'Sent. Anything else?', 'ok', 'Done.', '20 usdc')), true);
});

test('only a reply that states something about the account needs a fresh read behind it', async () => {
  const { claimsAccountState } = await import('./safety.js');
  for (const reply of [
    "Found them: @grachidefi (grachi). What's the budget in USDC and when do you need the books delivered?",
    'When do you need it delivered?',
    'Sure. What is it for, and how much?',
    'A protected deal holds the money in escrow until you release it.',
    'I can start that. Who is it with?',
  ]) {
    assert.equal(claimsAccountState(reply), false, reply);
  }
  for (const reply of [
    'Your balance is 120 USDC.',
    'You have 3 open deals.',
    'The payment went through.',
    'Tunde was paid 50 USDC yesterday.',
    'Your deal with @ada is funded and waiting on delivery.',
    'You received 20.00 USDC from @lawful.',
    'Nothing is pending on your account.',
    'Your request is live.',
  ]) {
    assert.equal(claimsAccountState(reply), true, reply);
  }
});

test('an unchecked reply is held back only when it claims something about the account', async () => {
  const { mayAnswer } = await import('./safety.js');
  assert.equal(mayAnswer({ needsLiveState: true, grounded: false, subjects: 2, reply: 'How much should it be?' }), true);
  assert.equal(mayAnswer({ needsLiveState: true, grounded: false, subjects: 2, reply: 'Your balance is 40 USDC.' }), false);
  assert.equal(mayAnswer({ needsLiveState: true, grounded: true, subjects: 2, reply: 'Your balance is 40 USDC.' }), true);
});
