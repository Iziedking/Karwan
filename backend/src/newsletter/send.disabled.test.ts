import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// With the newsletter switched off, nothing sends. Not even a dry run.
///
/// Its own file because `config` reads the environment once when it loads and
/// the test runner gives each file its own process. Re-importing the send
/// module with the flag cleared inside the main suite keeps the cached config
/// and passes for the wrong reason.
///
///   npx tsx --test src/newsletter/send.disabled.test.ts

assert.equal(
  process.env.NEWSLETTER_ENABLED,
  undefined,
  'this file must run with the newsletter switch unset',
);

const ISSUES = join(tmpdir(), `karwan-send-off-${process.pid}.json`);
process.env.NEWSLETTER_STORE_PATH = ISSUES;

const { createIssue, approveIssue } = await import('../db/newsletter.js');
const { sendIssue, SendRefused } = await import('./send.js');

before(() => {
  if (existsSync(ISSUES)) rmSync(ISSUES);
});

after(() => {
  if (existsSync(ISSUES)) rmSync(ISSUES);
});

test('an approved issue still will not go out while the switch is off', async () => {
  const issue = await createIssue({
    subject: 'Ready to go',
    preheader: 'and yet',
    sections: [{ key: 'shipped', heading: 'What we shipped', body: 'A thing.', signalIds: [] }],
    sources: [],
    signalIds: [],
    from: 0,
    to: 1,
    monthInReview: false,
  });
  await approveIssue(issue.id);

  // Both modes. The switch is not a send guard, it is an off switch, and a dry
  // run that still renders while the system is meant to be off is a system
  // somebody thinks is off and is not.
  for (const dryRun of [true, false]) {
    await assert.rejects(
      () => sendIssue(issue.id, { dryRun }),
      (e: Error) => {
        assert.ok(e instanceof SendRefused, `wrong error type: ${e.constructor.name}`);
        assert.match(e.message, /switched off/);
        return true;
      },
    );
  }
});
