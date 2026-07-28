import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db, pgEnabled } from './client.js';
import { signals } from './schema.js';

/// The signal pipeline: one shape, many sources.
///
/// Everything the newsletter and the social engine draft from lands here first,
/// whether it was pasted into the admin form, produced by a release watcher, or
/// summarised from somewhere else. One normalizer means the draft prompt reads
/// one shape and never grows a branch per source.
///
/// Two rules are enforced here rather than left to callers:
///
///   1. We keep a short excerpt of someone else's writing and never the article.
///      The link and the date are what make a newsletter cite rather than
///      reproduce, so those are mandatory in spirit and the excerpt is clamped.
///   2. The same thing arriving twice is one row. A watcher that runs hourly
///      must not fill the pipeline with copies of the same announcement.

export type SignalOrigin = 'manual' | 'arc' | 'circle' | 'karwan';
export type Importance = 'low' | 'normal' | 'high';

export const SIGNAL_ORIGINS: SignalOrigin[] = ['manual', 'arc', 'circle', 'karwan'];
export const IMPORTANCES: Importance[] = ['low', 'normal', 'high'];

/// How much of someone else's article we are willing to hold. Long enough to
/// draft from, short enough that the pipeline is not a copy of their site.
export const EXCERPT_MAX = 1500;

export interface Signal {
  id: string;
  /// Which pipeline produced this. Distinct from `source`, which is the human
  /// name of where it came from. A watcher needs to know its own rows to stay
  /// idempotent; a reader needs to know it came from Arc House.
  origin: SignalOrigin;
  source: string;
  title: string;
  /// Empty for raw notes with no article behind them.
  url: string;
  publishedAt: number;
  summary: string;
  rawExcerpt: string;
  /// The editorial line. This is the field that makes the newsletter worth
  /// reading, so it is carried through the pipeline rather than derived.
  myTake: string;
  tags: string[];
  importance: Importance;
  createdAt: number;
  /// Stable identity for dedupe. Empty when the signal has no stable identity,
  /// which is the honest answer for a pasted note.
  dedupeKey: string;
  dismissedAt?: number;
}

export interface SignalInput {
  origin: SignalOrigin;
  source: string;
  title: string;
  url?: string;
  publishedAt?: number;
  summary?: string;
  rawExcerpt?: string;
  myTake?: string;
  tags?: string[];
  importance?: Importance;
  /// For sources with an identity that is not a url: a git tag, a release id.
  /// Without it, an automated source cannot dedupe and will duplicate on every
  /// run.
  externalId?: string;
}

const STORE_PATH = resolve(process.cwd(), 'data', 'signals.json');

/// Query parameters that identify the reader rather than the article. Left in
/// place they defeat dedupe entirely: the same link shared on two platforms
/// arrives as two urls and becomes two rows.
const TRACKING_PARAMS = [
  /^utm_/,
  /^(ref|ref_src|referrer|source)$/,
  /^(fbclid|gclid|igshid|mc_cid|mc_eid|yclid|msclkid|twclid)$/,
  /^(s|t)$/,
];

/// Reduce a url to what identifies the article.
///
/// Anything that fails to parse comes back trimmed and lowercased rather than
/// throwing. A malformed url is a bad signal, not a reason to lose the row.
export function normaliseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }

  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  parsed.protocol = parsed.protocol.toLowerCase();

  const keep: Array<[string, string]> = [];
  for (const [key, value] of parsed.searchParams) {
    if (TRACKING_PARAMS.some((re) => re.test(key.toLowerCase()))) continue;
    keep.push([key, value]);
  }
  // Sorted, so the same parameters in a different order are the same url.
  keep.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  parsed.search = '';
  for (const [key, value] of keep) parsed.searchParams.append(key, value);

  // A trailing slash on a path is not a different page. On a bare host it is
  // the only path there is, so leave that one alone.
  //
  // Trimmed on the PATHNAME rather than on the serialised string: with a query
  // attached the url ends in the last parameter, so trimming the output leaves
  // `/a/b/?id=7` and `/a/b?id=7` as two different keys for one page. Dedupe
  // then fails on exactly the links people actually share.
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/// The identity a repeat run would collide with.
///
/// A url is the strongest identity available and is used whenever there is one.
/// Failing that, an origin plus an external id (a git tag, a release id) is
/// stable. A pasted note has neither, and rather than inventing an identity out
/// of its title, which would make two different notes on the same day collide,
/// it gets none and is never deduped. Two pasted notes are two notes.
export function dedupeKeyFor(input: {
  url?: string;
  origin: SignalOrigin;
  externalId?: string;
}): string {
  const url = normaliseUrl(input.url ?? '');
  if (url) return sha(`url:${url}`);
  if (input.externalId) return sha(`${input.origin}:${input.externalId}`);
  return '';
}

export function clampExcerpt(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= EXCERPT_MAX) return trimmed;
  return `${trimmed.slice(0, EXCERPT_MAX).trimEnd()}…`;
}

const IMPORTANCE_RANK: Record<Importance, number> = { low: 0, normal: 1, high: 2 };

export interface AddResult {
  signal: Signal;
  /// True when this url or external id was already in the pipeline.
  duplicate: boolean;
  /// True when the duplicate carried something the stored row was missing and
  /// the stored row was improved rather than discarded.
  merged: boolean;
}

/// Add a signal, or fold it into the one already there.
///
/// A duplicate is not simply dropped. Pasting the same link again with a take
/// written this time is how a take actually gets added, and throwing that away
/// because the url was already known would lose the most valuable field in the
/// row.
export async function addSignal(input: SignalInput): Promise<AddResult> {
  const dedupeKey = dedupeKeyFor(input);
  const url = input.url ? normaliseUrl(input.url) : '';

  if (dedupeKey) {
    const existing = await findByDedupeKey(dedupeKey);
    if (existing) {
      const merged = mergeInto(existing, input);
      if (merged) await persist(existing);
      return { signal: existing, duplicate: true, merged };
    }
  }

  const signal: Signal = {
    id: randomUUID(),
    origin: input.origin,
    source: input.source.trim(),
    title: input.title.trim(),
    url,
    publishedAt: input.publishedAt ?? Date.now(),
    summary: (input.summary ?? '').trim(),
    rawExcerpt: clampExcerpt(input.rawExcerpt ?? ''),
    myTake: (input.myTake ?? '').trim(),
    tags: normaliseTags(input.tags ?? []),
    importance: input.importance ?? 'normal',
    createdAt: Date.now(),
    dedupeKey,
  };

  if (pgEnabled) {
    await db().insert(signals).values({
      id: signal.id,
      origin: signal.origin,
      dedupeKey: signal.dedupeKey || null,
      createdAt: signal.createdAt,
      dismissedAt: null,
      data: signal,
    });
  } else {
    const store = loadFile();
    store[signal.id] = signal;
    saveFile(store);
  }

  return { signal, duplicate: false, merged: false };
}

/// Fold the incoming into the stored row, in place. Returns whether anything
/// changed. Only ever fills gaps or raises importance: a second sighting is not
/// a reason to overwrite an editor's words with a watcher's.
function mergeInto(stored: Signal, input: SignalInput): boolean {
  let changed = false;

  const take = (input.myTake ?? '').trim();
  if (take && !stored.myTake) {
    stored.myTake = take;
    changed = true;
  }

  const summary = (input.summary ?? '').trim();
  if (summary && !stored.summary) {
    stored.summary = summary;
    changed = true;
  }

  const excerpt = clampExcerpt(input.rawExcerpt ?? '');
  if (excerpt && !stored.rawExcerpt) {
    stored.rawExcerpt = excerpt;
    changed = true;
  }

  const tags = normaliseTags([...stored.tags, ...(input.tags ?? [])]);
  if (tags.length !== stored.tags.length) {
    stored.tags = tags;
    changed = true;
  }

  const incoming = input.importance;
  if (incoming && IMPORTANCE_RANK[incoming] > IMPORTANCE_RANK[stored.importance]) {
    stored.importance = incoming;
    changed = true;
  }

  return changed;
}

function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    const clean = tag.trim().toLowerCase();
    if (clean) seen.add(clean);
  }
  return [...seen].sort();
}

async function findByDedupeKey(key: string): Promise<Signal | null> {
  if (pgEnabled) {
    const rows = await db().select().from(signals).where(eq(signals.dedupeKey, key));
    return rows[0]?.data ?? null;
  }
  return Object.values(loadFile()).find((s) => s.dedupeKey === key) ?? null;
}

export interface SignalQuery {
  /// Epoch ms. The newsletter collects everything since the last issue.
  since?: number;
  origin?: SignalOrigin;
  includeDismissed?: boolean;
  limit?: number;
}

export async function listSignals(query: SignalQuery = {}): Promise<Signal[]> {
  const all = pgEnabled
    ? (await db().select().from(signals).orderBy(desc(signals.createdAt))).map((r) => r.data)
    : Object.values(loadFile());

  const filtered = all
    .filter((s) => (query.includeDismissed ? true : !s.dismissedAt))
    .filter((s) => (query.since === undefined ? true : s.createdAt >= query.since))
    .filter((s) => (query.origin === undefined ? true : s.origin === query.origin))
    .sort((a, b) => b.createdAt - a.createdAt);

  return query.limit ? filtered.slice(0, query.limit) : filtered;
}

export async function getSignal(id: string): Promise<Signal | null> {
  if (pgEnabled) {
    const rows = await db().select().from(signals).where(eq(signals.id, id));
    return rows[0]?.data ?? null;
  }
  return loadFile()[id] ?? null;
}

/// Take a signal out of the pipeline without deleting it.
///
/// Dismissed rather than removed, because "we saw this and chose not to write
/// about it" is worth knowing later, and because a delete button on a pipeline
/// fed by a watcher just means the watcher puts it back.
export async function dismissSignal(id: string): Promise<Signal | null> {
  const signal = await getSignal(id);
  if (!signal) return null;
  if (signal.dismissedAt) return signal;

  signal.dismissedAt = Date.now();
  await persist(signal);
  return signal;
}

async function persist(signal: Signal): Promise<void> {
  if (pgEnabled) {
    await db()
      .update(signals)
      .set({
        origin: signal.origin,
        dedupeKey: signal.dedupeKey || null,
        dismissedAt: signal.dismissedAt ?? null,
        data: signal,
      })
      .where(eq(signals.id, signal.id));
    return;
  }
  const store = loadFile();
  store[signal.id] = signal;
  saveFile(store);
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function loadFile(): Record<string, Signal> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, Signal>;
  } catch {
    return {};
  }
}

function saveFile(store: Record<string, Signal>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
