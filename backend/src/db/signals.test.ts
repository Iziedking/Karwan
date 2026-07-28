import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/// The definition of done for signal ingestion: all three sources land in one
/// table with one shape, and running any of them twice adds nothing.
///
/// Against the flat-file store, not Postgres, for the same reasons as the team
/// key tests: hermetic, and a stray `--env-file` cannot point it at production.
///
///   npx tsx --test src/db/signals.test.ts

assert.equal(
  process.env.DATABASE_URL,
  undefined,
  'refusing to run: DATABASE_URL is set, which would run this against a real database',
);

// Its own store, in a temp dir, so this never touches the developer's real
// pipeline and never races the other suites.
const STORE_PATH = join(tmpdir(), `karwan-signals-store-${process.pid}.json`);
process.env.SIGNALS_STORE_PATH = STORE_PATH;

const { addSignal, listSignals, dismissSignal, normaliseUrl, dedupeKeyFor, clampExcerpt, EXCERPT_MAX } =
  await import('./signals.js');
const { parseReleaseNotes, ingestReleaseNotes } = await import('../agents/releaseWatcher.js');

beforeEach(() => {
  if (existsSync(STORE_PATH)) rmSync(STORE_PATH);
});

after(() => {
  if (existsSync(STORE_PATH)) rmSync(STORE_PATH);
});

test('the same article under different tracking urls is one signal', async () => {
  const first = await addSignal({
    origin: 'manual',
    source: 'Arc House',
    title: 'Arc ships something',
    url: 'https://arc.house/posts/thing?utm_source=twitter&utm_campaign=launch',
  });
  assert.equal(first.duplicate, false);

  // Same article, shared from somewhere else: www, trailing slash, a fragment,
  // a different tracking parameter. Every one of these is the same page.
  const second = await addSignal({
    origin: 'manual',
    source: 'Arc House',
    title: 'Arc ships something',
    url: 'https://www.arc.house/posts/thing/?fbclid=abc#intro',
  });

  assert.equal(second.duplicate, true);
  assert.equal(second.signal.id, first.signal.id);
  assert.equal((await listSignals()).length, 1);
});

test('normalising a url keeps what identifies the page and drops the rest', () => {
  assert.equal(
    normaliseUrl('https://WWW.Example.com/a/b/?utm_source=x&id=7#top'),
    'https://example.com/a/b?id=7',
  );
  // Parameter order is not identity.
  assert.equal(normaliseUrl('https://e.com/p?b=2&a=1'), normaliseUrl('https://e.com/p?a=1&b=2'));
  // A bare host keeps its only path.
  assert.equal(normaliseUrl('https://example.com/'), 'https://example.com/');
  // Junk comes back rather than throwing, because a bad url is a bad signal and
  // not a reason to lose the row.
  assert.equal(normaliseUrl('not a url'), 'not a url');
  assert.equal(normaliseUrl(''), '');
});

test('pasting the same take twice does not overwrite the first one, but a missing take gets filled', async () => {
  const url = 'https://circle.com/blog/gateway';

  await addSignal({ origin: 'manual', source: 'Circle', title: 'Gateway', url });

  const second = await addSignal({
    origin: 'manual',
    source: 'Circle',
    title: 'Gateway',
    url,
    myTake: 'This is the unified balance we already build on.',
    tags: ['circle', 'gateway'],
    importance: 'high',
  });

  assert.equal(second.duplicate, true);
  assert.equal(second.merged, true);
  assert.equal(second.signal.myTake, 'This is the unified balance we already build on.');
  assert.deepEqual(second.signal.tags, ['circle', 'gateway']);
  assert.equal(second.signal.importance, 'high');

  // A later sighting must not clobber the editorial line that is already there.
  const third = await addSignal({
    origin: 'manual',
    source: 'Circle',
    title: 'Gateway',
    url,
    myTake: 'a worse take written later',
    importance: 'low',
  });
  assert.equal(third.signal.myTake, 'This is the unified balance we already build on.');
  assert.equal(third.signal.importance, 'high', 'importance must not be downgraded by a repeat');
  assert.equal((await listSignals()).length, 1);
});

test('two pasted notes with no url are two notes', async () => {
  // Notes have no stable identity. Inventing one from the title would make two
  // genuinely different notes collide, which loses work.
  const a = await addSignal({ origin: 'manual', source: 'my head', title: 'Idea' });
  const b = await addSignal({ origin: 'manual', source: 'my head', title: 'Idea' });

  assert.equal(b.duplicate, false);
  assert.notEqual(a.signal.id, b.signal.id);
  assert.equal(a.signal.dedupeKey, '');
  assert.equal((await listSignals()).length, 2);
});

test('an automated source dedupes on its external id', async () => {
  const input = {
    origin: 'arc' as const,
    source: 'Arc docs',
    title: 'Gateway on Arc',
    externalId: 'arc-docs-gateway-2026-07',
  };
  await addSignal(input);
  const again = await addSignal(input);

  assert.equal(again.duplicate, true);
  assert.equal((await listSignals()).length, 1);

  // Same external id under a different origin is a different thing.
  const other = await addSignal({ ...input, origin: 'circle' });
  assert.equal(other.duplicate, false);
  assert.notEqual(dedupeKeyFor(input), dedupeKeyFor({ ...input, origin: 'circle' }));
});

test('someone else words are clamped to an excerpt', async () => {
  const long = 'x'.repeat(EXCERPT_MAX + 500);
  assert.ok(clampExcerpt(long).length <= EXCERPT_MAX + 1);

  const { signal } = await addSignal({
    origin: 'manual',
    source: 'Somebody else',
    title: 'Their article',
    url: 'https://example.com/theirs',
    rawExcerpt: long,
  });
  assert.ok(
    signal.rawExcerpt.length <= EXCERPT_MAX + 1,
    'the store must never hold more than an excerpt of someone else writing',
  );
});

test('release notes parse into one signal per shipped item', () => {
  const items = parseReleaseNotes(`# Release notes

## July 27, 2026

### Invoice factoring is opt-in

Factoring used to be opt-out.

A supplier now requests early payout.

### Collateral is graded by reputation

Body here.

## June 1, 2026

### An older thing

Older body.
`);

  assert.equal(items.length, 3);
  assert.equal(items[0]!.title, 'Invoice factoring is opt-in');
  assert.equal(items[0]!.dateHeading, 'July 27, 2026');
  assert.ok(items[0]!.body.startsWith('Factoring used to be opt-out.'));
  assert.equal(new Date(items[0]!.publishedAt).toISOString().slice(0, 10), '2026-07-27');
  assert.equal(items[2]!.title, 'An older thing');
  assert.equal(new Date(items[2]!.publishedAt).toISOString().slice(0, 10), '2026-06-01');

  // The `# Release notes` title is not a release, and neither is a heading that
  // does not carry a parsable date.
  assert.equal(items.some((i) => i.title === 'Release notes'), false);
  assert.equal(parseReleaseNotes('## Not a date\n\n### Thing\n\nBody.\n').length, 0);
});

test('ingesting the real release notes twice adds nothing the second time', async () => {
  // The definition of done, against the file that actually ships.
  const first = await ingestReleaseNotes();
  assert.ok(first.found > 0, 'no release notes were found, so this proves nothing');
  assert.ok(first.added > 0, 'nothing recent enough to ingest; widen RELEASE_SIGNAL_MAX_AGE_DAYS');

  const before = (await listSignals()).length;
  const second = await ingestReleaseNotes();

  assert.equal(second.added, 0, 'a repeat ingest created new rows');
  assert.equal(second.duplicate, first.added);
  assert.equal((await listSignals()).length, before);
});

test('all three sources land in one shape', async () => {
  await addSignal({
    origin: 'manual',
    source: 'Arc House',
    title: 'A pasted post',
    url: 'https://arc.house/p/1',
    myTake: 'why it matters',
  });
  await addSignal({
    origin: 'arc',
    source: 'Arc docs',
    title: 'A docs change',
    externalId: 'docs-1',
  });
  await ingestReleaseNotes();

  const all = await listSignals();
  const origins = new Set(all.map((s) => s.origin));
  assert.ok(origins.has('manual') && origins.has('arc') && origins.has('karwan'), [...origins].join(','));

  for (const s of all) {
    for (const field of ['id', 'origin', 'source', 'title', 'summary', 'rawExcerpt', 'myTake'] as const) {
      assert.equal(typeof s[field], 'string', `${s.id} has no string ${field}`);
    }
    assert.ok(Array.isArray(s.tags));
    assert.equal(typeof s.publishedAt, 'number');
    assert.equal(typeof s.createdAt, 'number');
    assert.ok(['low', 'normal', 'high'].includes(s.importance));
  }
});

test('dismissing hides a signal without losing it', async () => {
  const { signal } = await addSignal({
    origin: 'manual',
    source: 'Somewhere',
    title: 'Not for us',
    url: 'https://example.com/skip',
  });

  await dismissSignal(signal.id);
  assert.equal((await listSignals()).length, 0);

  const kept = await listSignals({ includeDismissed: true });
  assert.equal(kept.length, 1);
  assert.ok(kept[0]!.dismissedAt);

  // A watcher re-reading its source must not resurrect a dismissed row.
  const again = await addSignal({
    origin: 'manual',
    source: 'Somewhere',
    title: 'Not for us',
    url: 'https://example.com/skip',
  });
  assert.equal(again.duplicate, true);
  assert.equal((await listSignals()).length, 0);
});

test('collecting since a timestamp is what the newsletter will do', async () => {
  await addSignal({ origin: 'manual', source: 's', title: 'old', url: 'https://e.com/old' });
  const cutoff = Date.now() + 1;
  await new Promise((r) => setTimeout(r, 5));
  await addSignal({ origin: 'manual', source: 's', title: 'new', url: 'https://e.com/new' });

  const since = await listSignals({ since: cutoff });
  assert.equal(since.length, 1);
  assert.equal(since[0]!.title, 'new');
});
