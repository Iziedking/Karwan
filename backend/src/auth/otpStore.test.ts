import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmailCodes, normalizeEmail, type PendingEmailCode } from './otpStore.js';

/// Email codes shared by the website routes and the chat bots.
///
///   npx tsx --test src/auth/otpStore.test.ts

function setup() {
  const sent: Array<{ email: string; code: string }> = [];
  const codes = createEmailCodes({
    store: new Map<string, PendingEmailCode>(),
    secret: () => 'test-secret',
    send: async (email, code) => {
      sent.push({ email, code });
      return { delivered: false };
    },
    devCodes: () => true,
  });
  return { codes, sent };
}

test('an email is trimmed and lowercased the same way everywhere', () => {
  assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
});

test('a code typed with spaces and a differently cased email verifies', async () => {
  const { codes } = setup();
  const { devCode } = await codes.request('ada@example.com');
  assert.equal(codes.verify('ADA@example.com ', `${devCode!.slice(0, 3)} ${devCode!.slice(3)}`), 'ok');
});

test('a used code cannot be used twice', async () => {
  const { codes } = setup();
  const { devCode } = await codes.request('ada@example.com');
  assert.equal(codes.verify('ada@example.com', devCode!), 'ok');
  assert.equal(codes.verify('ada@example.com', devCode!), 'none');
});

test('five wrong codes lock the email, even before the right one', async () => {
  const { codes } = setup();
  const { devCode } = await codes.request('ada@example.com');
  const wrong = devCode === '000000' ? '111111' : '000000';
  const results = [1, 2, 3, 4, 5].map(() => codes.verify('ada@example.com', wrong));
  assert.deepEqual(results, ['wrong', 'wrong', 'wrong', 'wrong', 'locked']);
  assert.equal(codes.verify('ada@example.com', devCode!), 'locked');
});

test('no dev code is returned when dev codes are off', async () => {
  const codes = createEmailCodes({
    store: new Map(),
    secret: () => 's',
    send: async () => ({ delivered: false }),
    devCodes: () => false,
  });
  assert.equal((await codes.request('ada@example.com')).devCode, undefined);
});

function clocked() {
  const clock = { t: 1_000 };
  const sent: string[] = [];
  const codes = createEmailCodes({
    store: new Map<string, PendingEmailCode>(),
    secret: () => 'test-secret',
    send: async (_email, code) => {
      sent.push(code);
      return { delivered: false };
    },
    devCodes: () => true,
    now: () => clock.t,
  });
  return { codes, clock, sent };
}

test('asking for a new code keeps the wrong guesses already made', async () => {
  const { codes } = clocked();
  const first = await codes.request('ada@example.com');
  const wrong = first.devCode === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) assert.equal(codes.verify('ada@example.com', wrong), 'wrong');
  const second = await codes.request('ada@example.com');
  const wrong2 = second.devCode === '000000' ? '111111' : '000000';
  assert.equal(codes.verify('ada@example.com', wrong2), 'locked');
});

test('a locked email stays locked, and no new code is sent, until ten minutes pass', async () => {
  const { codes, clock } = clocked();
  const { devCode } = await codes.request('ada@example.com');
  const wrong = devCode === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) codes.verify('ada@example.com', wrong);
  const again = await codes.request('ada@example.com');
  assert.equal(again.limited, true);
  assert.equal(again.devCode, undefined);
  assert.equal(codes.verify('ada@example.com', devCode!), 'locked');
  clock.t += 10 * 60_000 + 1;
  assert.equal((await codes.request('ada@example.com')).limited, undefined);
});

test('no more than five codes go to one email in ten minutes', async () => {
  const { codes, sent, clock } = clocked();
  for (let i = 0; i < 5; i++) assert.equal((await codes.request('ada@example.com')).limited, undefined);
  assert.equal((await codes.request('ada@example.com')).limited, true);
  assert.equal(sent.length, 5);
  clock.t += 10 * 60_000 + 1;
  assert.equal((await codes.request('ada@example.com')).limited, undefined);
});
