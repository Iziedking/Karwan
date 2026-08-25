import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// The newsletter engine, minus the model.
///
/// Everything here is the part that decides whether a reader's attention gets
/// spent: the caps, the thresholds, the monthly floor, the state machine, and
/// the two passes a draft has to survive. The drafting call itself is not
/// tested here because testing it would mean testing a model.
///
///   npx tsx --test src/newsletter/engine.test.ts

assert.equal(
  process.env.DATABASE_URL,
  undefined,
  'refusing to run: DATABASE_URL is set, which would run this against a real database',
);

const SIGNALS = join(tmpdir(), `karwan-nl-signals-${process.pid}.json`);
const ISSUES = join(tmpdir(), `karwan-nl-issues-${process.pid}.json`);
process.env.SIGNALS_STORE_PATH = SIGNALS;
process.env.NEWSLETTER_STORE_PATH = ISSUES;

const { addSignal } = await import('../db/signals.js');
const { cluster, decide, ENOUGH_ECOSYSTEM } = await import('./collect.js');
const { reviewDraft, checkClaims } = await import('./checks.js');
const { renderIssue, renderText } = await import('./render.js');
const {
  createIssue,
  approveIssue,
  rejectIssue,
  editIssue,
  markSent,
  latestRejectionNote,
  getIssue,
} = await import('../db/newsletter.js');

beforeEach(() => {
  for (const path of [SIGNALS, ISSUES]) if (existsSync(path)) rmSync(path);
});

after(() => {
  for (const path of [SIGNALS, ISSUES]) if (existsSync(path)) rmSync(path);
});

function ship(n: number) {
  return addSignal({
    origin: 'karwan',
    source: 'Karwan release',
    title: `We shipped thing ${n}`,
    externalId: `ship-${n}`,
    summary: 'A real thing that went live.',
  });
}

function ecosystem(n: number) {
  return addSignal({
    origin: 'arc',
    source: 'Arc docs',
    title: `Arc changed thing ${n}`,
    url: `https://docs.arc.network/thing-${n}`,
  });
}

/// A decision clock the calendar cannot move.
///
/// Two problems this solves at once. Without a pin, every threshold test
/// silently becomes a monthly-floor test for the last five days of each month
/// and passes for the other twenty-five. And a hardcoded date rots: pinned to a
/// fixed day, these tests would start failing once the real clock passed it,
/// because the store writes real timestamps that would then sit in the future.
///
/// So it is derived: the tenth of next month. Always comfortably mid-month, so
/// the floor never fires, and always after anything a test just wrote.
function midMonthAhead(from = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 10, 12, 0, 0));
}

const PINNED = midMonthAhead();
const ENABLED = { enabled: true, now: PINNED };

test('nothing in the pipeline means no issue', async () => {
  const d = await decide(ENABLED);
  assert.equal(d.draft, false);
  assert.match(d.reason, /Nothing new/);
});

test('one thing we shipped is enough, a couple of other people news is not', async () => {
  await ecosystem(1);
  await ecosystem(2);
  let d = await decide(ENABLED);
  assert.equal(d.draft, false, 'two ecosystem links should not trigger an issue');
  assert.match(d.reason, /none of them ours/);

  // A newsletter of nothing but other people's announcements is a link roundup.
  for (let i = 3; i <= ENOUGH_ECOSYSTEM; i++) await ecosystem(i);
  d = await decide(ENABLED);
  assert.equal(d.draft, true);

  await ship(1);
  d = await decide(ENABLED);
  assert.match(d.reason, /Karwan shipped/);
});

test('the kill switch beats everything, including force', async () => {
  await ship(1);
  await ship(2);

  const off = await decide({ enabled: false });
  assert.equal(off.draft, false);
  assert.equal(off.blocked, 'kill-switch');

  // Force overrides the caps and the thresholds. It must not override somebody
  // having decided the whole thing should not run.
  const forced = await decide({ enabled: false, force: true });
  assert.equal(forced.draft, false);
  assert.equal(forced.blocked, 'kill-switch');
});

test('a send in the last day blocks the next one, and says so as a cap', async () => {
  await ship(1);
  const issue = await createIssue({
    subject: 's',
    preheader: 'p',
    sections: [],
    sources: [],
    signalIds: [],
    from: 0,
    to: 1,
    monthInReview: false,
  });
  await approveIssue(issue.id);
  await markSent(issue.id);

  // Real clock: the send was just recorded, so "within the last day" is only
  // true relative to now.
  const d = await decide({ enabled: true, now: new Date() });
  assert.equal(d.draft, false);
  // A cap and a quiet week look identical in the panel otherwise, and only one
  // of them is a bug.
  assert.equal(d.blocked, 'daily-cap');
  assert.match(d.reason, /last 24 hours/);

  assert.equal((await decide({ ...ENABLED, force: true })).draft, true, 'force should beat a cap');
});

test('the monthly cap blocks even with news', async () => {
  await ship(1);
  for (let i = 0; i < 2; i++) {
    const issue = await createIssue({
      subject: `s${i}`,
      preheader: 'p',
      sections: [],
      sources: [],
      signalIds: [],
      from: 0,
      to: 1,
      monthInReview: false,
    });
    await approveIssue(issue.id);
    await markSent(issue.id);
  }

  // Real clock here, because the sends just recorded are stamped with it and
  // the question is how many went out in the month they landed in. The daily
  // gap is set to zero so the cap under test is the one that reports.
  const d = await decide({
    enabled: true,
    now: new Date(),
    minHoursBetweenSends: 0,
    maxPerMonth: 2,
  });
  assert.equal(d.blocked, 'monthly-cap');
});

test('the monthly floor fires at the end of a quiet month, but never on an empty one', async () => {
  // Two days from the end of the month, nothing sent.
  const nearEnd = new Date(Date.UTC(2026, 6, 30, 12, 0, 0));

  const empty = await decide({ ...ENABLED, now: nearEnd });
  assert.equal(empty.draft, false, 'an empty month in review is worse than silence');

  await ecosystem(1);
  const withSomething = await decide({ ...ENABLED, now: nearEnd });
  assert.equal(withSomething.draft, true);
  assert.equal(withSomething.monthInReview, true);

  // Mid-month, the same thin pipeline is not enough.
  const midMonth = await decide({ ...ENABLED, now: new Date(Date.UTC(2026, 6, 10, 12, 0, 0)) });
  assert.equal(midMonth.draft, false);
});

test('signals cluster into the three sections, and a note with no link is a lesson', async () => {
  await ship(1);
  await ecosystem(1);
  await addSignal({ origin: 'manual', source: 'my head', title: 'A thing we worked out' });
  await addSignal({
    origin: 'manual',
    source: 'Somewhere',
    title: 'A link somebody found',
    url: 'https://example.com/a',
  });

  const clusters = cluster((await decide(ENABLED)).signals);
  const by = Object.fromEntries(clusters.map((c) => [c.key, c.signals.map((s) => s.title)]));

  assert.deepEqual(by.shipped, ['We shipped thing 1']);
  assert.equal(by.ecosystem?.length, 2, 'a manual drop with a link is news, not a lesson');
  assert.deepEqual(by.learned, ['A thing we worked out']);
});

test('an issue already drafted does not get its signals collected twice', async () => {
  await ship(1);
  const first = await decide(ENABLED);
  assert.equal(first.draft, true);

  await createIssue({
    subject: 's',
    preheader: 'p',
    sections: [],
    sources: [],
    signalIds: first.signals.map((s) => s.id),
    from: first.from,
    to: first.to,
    monthInReview: false,
  });

  // The window moved on. Without this, a rejected draft would be immediately
  // followed by a second draft saying exactly the same things.
  const second = await decide({ ...ENABLED, force: true });
  assert.equal(second.signals.length, 0);
  assert.equal(second.draft, false);
});

test('the state machine refuses the moves that would make approval meaningless', async () => {
  const issue = await createIssue({
    subject: 'Subject',
    preheader: 'p',
    sections: [{ key: 'shipped', heading: 'What we shipped', body: 'Body.', signalIds: [] }],
    sources: [],
    signalIds: [],
    from: 0,
    to: 1,
    monthInReview: false,
  });

  await approveIssue(issue.id);
  // Editing an approved issue would mean the thing approved is not the thing
  // that goes out.
  await assert.rejects(() => editIssue(issue.id, { subject: 'Sneaky' }), /only a draft can be edited/);

  const second = await createIssue({
    subject: 'Another',
    preheader: 'p',
    sections: [],
    sources: [],
    signalIds: [],
    from: 0,
    to: 1,
    monthInReview: false,
  });
  // Only an approved issue can be marked sent, so a draft can never be recorded
  // as delivered.
  await assert.rejects(() => markSent(second.id), /only an approved issue can be sent/);

  await rejectIssue(second.id, 'Too long, and stop calling it a platform.');
  await assert.rejects(() => approveIssue(second.id), /rejected and cannot be approved/);
  assert.equal(await latestRejectionNote(), 'Too long, and stop calling it a platform.');

  const sent = await markSent(issue.id);
  assert.equal(sent?.status, 'sent');
  await assert.rejects(() => rejectIssue(issue.id, 'too late'), /already gone out/);
  assert.equal((await getIssue(issue.id))?.status, 'sent');
});

test('the voice pass blocks on the tells and only warns on the rest', () => {
  const clean = reviewDraft('Karwan settled a deal on Arc today.', []);
  assert.equal(clean.clean, true);

  const bad = reviewDraft("In today's fast-paced world, our seamless rail — really.", []);
  assert.equal(bad.clean, false);
  const rules = bad.findings.map((f) => f.rule);
  assert.ok(rules.includes('no-em-dash'));
  assert.ok(rules.includes('no-filler-opener'));
  assert.ok(rules.includes('no-ai-vocabulary'));

  // Warnings must not block: they are judgement calls, not errors.
  const hedged = reviewDraft('This is arguably the right shape.', []);
  assert.equal(hedged.clean, true);
  assert.equal(hedged.warnings, 1);
});

test('a claim nothing in the pipeline supports is caught', async () => {
  await ship(1);
  const signals = (await decide(ENABLED)).signals;

  // Invented out of nothing. The canon check cannot see this, because a feature
  // we never built is not in the canon either.
  const invented = checkClaims(
    'Karwan now supports automated payroll disbursement across sixty jurisdictions.',
    signals,
  );
  assert.equal(invented.length, 1);
  assert.equal(invented[0]!.rule, 'unsourced-claim');

  // Written from what the signals actually said.
  const sourced = checkClaims('Karwan shipped thing 1, a real thing that went live.', signals);
  assert.equal(sourced.length, 0);
});

test('the rendered issue escapes, links, and keeps a text part', () => {
  const issue = {
    id: 'x',
    status: 'draft' as const,
    subject: 'What shipped in July',
    preheader: 'Escrow, and what moved on Arc.',
    sections: [
      {
        key: 'shipped' as const,
        heading: 'What we shipped',
        body: 'Factoring is opt-in now. Read the [release notes](https://karwan.site/releases).\n\n- A bullet with <script>alert(1)</script> in it',
        signalIds: [],
      },
    ],
    sources: [
      {
        signalId: 's1',
        title: 'Arc docs',
        url: 'https://docs.arc.network/x',
        source: 'Arc',
        publishedAt: Date.UTC(2026, 6, 24),
      },
    ],
    signalIds: [],
    from: 0,
    to: 1,
    monthInReview: false,
    createdAt: 0,
    updatedAt: 0,
  };

  const rendered = renderIssue(issue);
  assert.ok(rendered.html.includes('<a href="https://karwan.site/releases"'), 'link did not render');
  assert.equal(rendered.html.includes('<script>'), false, 'html was not escaped');
  assert.ok(rendered.html.includes('&lt;script&gt;'));
  assert.ok(rendered.html.includes('2026-07-24'), 'the source date is missing');
  assert.ok(rendered.html.includes('KARWAN DISPATCH'));

  // A missing text part is a spam signal, and the url has to survive into it.
  const text = renderText(issue);
  assert.ok(text.includes('https://karwan.site/releases'));
  assert.equal(text.includes('['), false, 'markdown leaked into the text part');

  const monthly = renderIssue({ ...issue, monthInReview: true });
  assert.ok(monthly.html.includes('MONTH IN REVIEW'));
});

test('an imported branded document is the final approval and send rendering', () => {
  const issue = {
    id: 'branded',
    status: 'draft' as const,
    subject: 'Branded issue',
    preheader: 'A branded preview.',
    sourceHtml: '<!doctype html><html><body><style>.brand{color:lime}</style><main class="brand">karwan <a href="https://x.com/karwanBuild">follow us @karwanBuild</a><script>alert(1)</script></main></body></html>',
    sections: [{ key: 'learned' as const, heading: 'Readiness', body: '[follow us @karwanBuild](https://x.com/karwanBuild)', signalIds: [] }],
    sources: [],
    signalIds: [],
    from: 0,
    to: 1,
    monthInReview: false,
    createdAt: 0,
    updatedAt: 0,
  };

  const rendered = renderIssue(issue);
  assert.match(rendered.html, /class="brand"/);
  assert.match(rendered.html, /https:\/\/x\.com\/karwanBuild/);
  assert.doesNotMatch(rendered.html, /<script/i);
  assert.doesNotMatch(rendered.html, /KARWAN DISPATCH/);
});
