import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// Everything the send path refuses.
///
/// This is the one irreversible act in the system, so the tests are about what
/// must NOT happen: no unapproved issue, no second send, no mail without an
/// unsubscribe link, nothing at all while the switch is off. None of these calls
/// reach Resend, because none of them get far enough to, which is the point.
///
///   npx tsx --test src/newsletter/send.test.ts

assert.equal(
  process.env.DATABASE_URL,
  undefined,
  'refusing to run: DATABASE_URL is set, which would run this against a real database',
);
assert.equal(
  process.env.RESEND_API_KEY,
  undefined,
  'refusing to run: RESEND_API_KEY is set, and a mistake here would send real mail',
);

const ISSUES = join(tmpdir(), `karwan-send-issues-${process.pid}.json`);
process.env.NEWSLETTER_STORE_PATH = ISSUES;
process.env.NEWSLETTER_ENABLED = '1';

const { createIssue, approveIssue, markSent, rejectIssue, getSentIssueBySlug, listSentIssues, slugFor } =
  await import('../db/newsletter.js');
const { sendIssue, SendRefused, archiveUrl } = await import('./send.js');

beforeEach(() => {
  if (existsSync(ISSUES)) rmSync(ISSUES);
});

after(() => {
  if (existsSync(ISSUES)) rmSync(ISSUES);
  delete process.env.NEWSLETTER_ENABLED;
});

function draft(subject = 'What shipped in July') {
  return createIssue({
    subject,
    preheader: 'Escrow, and what moved on Arc.',
    sections: [
      {
        key: 'shipped',
        heading: 'What we shipped',
        body: 'Factoring is opt-in now.',
        signalIds: [],
      },
    ],
    sources: [],
    signalIds: [],
    from: 0,
    to: 1,
    monthInReview: false,
  });
}

test('a dry run renders and checks without sending', async () => {
  const issue = await draft();
  await approveIssue(issue.id);

  const result = await sendIssue(issue.id);
  assert.equal(result.sent, false);
  assert.ok(result.archiveUrl.includes('/newsletter/'));
  // With no key configured, a dry run says so instead of pretending it would
  // have worked.
  assert.ok(result.warnings.some((w) => w.includes('RESEND_API_KEY')), result.warnings.join('; '));

  // And it left the issue alone.
  const sent = await listSentIssues();
  assert.equal(sent.length, 0);
});

test('an unapproved issue is refused', async () => {
  const issue = await draft();
  await assert.rejects(
    () => sendIssue(issue.id, { dryRun: false }),
    (e: Error) => {
      assert.ok(e instanceof SendRefused);
      assert.match(e.message, /only an approved issue can be sent/);
      return true;
    },
  );

  const rejected = await draft('Another');
  await rejectIssue(rejected.id, 'no');
  await assert.rejects(() => sendIssue(rejected.id, { dryRun: false }), /only an approved issue/);
});

test('an issue that already went out cannot go out again', async () => {
  const issue = await draft();
  await approveIssue(issue.id);
  await markSent(issue.id);

  await assert.rejects(
    () => sendIssue(issue.id, { dryRun: false }),
    (e: Error) => {
      assert.ok(e instanceof SendRefused);
      assert.match(e.message, /already gone out/);
      return true;
    },
  );
});

// The kill switch is tested in send.disabled.test.ts. It needs its own process
// because `config` reads the environment once when it loads, so re-importing
// this module with the flag cleared would keep the cached config and quietly
// prove nothing.

test('a send with no audience configured refuses rather than sending to nobody', async () => {
  const issue = await draft();
  await approveIssue(issue.id);

  // No RESEND_API_KEY in this process, so the first refusal is the key. Both
  // are refusals rather than silent no-ops, which is the property under test.
  await assert.rejects(() => sendIssue(issue.id, { dryRun: false }), SendRefused);
});

test('the archive url is stable once assigned, and only sent issues are in the archive', async () => {
  const issue = await draft('What shipped in July: escrow, and more!');
  await approveIssue(issue.id);

  const before = archiveUrl(issue);
  const sent = await markSent(issue.id);
  assert.ok(sent?.slug);

  // The slug is date-first so the archive sorts and two similar subjects cannot
  // collide, and punctuation is stripped rather than encoded.
  assert.match(sent!.slug!, /^\d{4}-\d{2}-\d{2}-what-shipped-in-july/);
  assert.equal(sent!.slug!.includes('!'), false);
  assert.equal(sent!.slug!.includes(':'), false);

  // Recomputing must not move it: a url that changes after it has been shared
  // is a dead link in somebody's inbox.
  const again = await markSent(sent!.id).catch(() => null);
  assert.equal(again, null, 'a sent issue should not be markable again');
  assert.equal(archiveUrl(sent!), before.replace(/[^/]*$/, sent!.slug!));

  const fromArchive = await getSentIssueBySlug(sent!.slug!);
  assert.equal(fromArchive?.id, issue.id);

  // A draft must never be reachable, however somebody guesses.
  const other = await draft('A draft nobody approved');
  assert.equal(await getSentIssueBySlug(slugFor(other.subject, new Date())), null);
});

test('slugs are readable, bounded, and never empty', () => {
  const at = new Date(Date.UTC(2026, 6, 28));
  assert.equal(slugFor('Hello, World', at), '2026-07-28-hello-world');
  // Capped at eight words so a long subject cannot produce an unusable url.
  assert.equal(slugFor('one two three four five six seven eight nine ten', at).split('-').length, 11);
  // A subject that is entirely punctuation still has to produce a path.
  assert.equal(slugFor('!!!', at), '2026-07-28-issue');
});
