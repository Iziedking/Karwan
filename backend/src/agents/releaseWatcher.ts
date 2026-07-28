import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { addSignal } from '../db/signals.js';
import { logger } from '../logger.js';

/// Karwan's own releases as signals, read from RELEASE_NOTES.md.
///
/// Not from git tags: there are none, and the runtime image carries only
/// `backend/dist`, so there is no `.git` to read even if there were. Not from
/// feature flags either, because a flag says a code path exists, not that
/// anything shipped worth telling anyone about. The release notes are the one
/// place where "we shipped this and here is why it matters" is already written
/// down by a human.
///
/// This runs ONCE at boot rather than on a timer. The file lives inside the
/// image, so its contents cannot change while the process is alive. Polling it
/// would be a loop that can only ever find what it found the first time.

/// The file is at the repo root in development and copied next to the compiled
/// backend in the image. Try both rather than assuming a layout.
const CANDIDATE_PATHS = [
  resolve(process.cwd(), 'RELEASE_NOTES.md'),
  resolve(process.cwd(), '..', 'RELEASE_NOTES.md'),
];

/// Anything older than this is history, not news. Without a cutoff the first
/// boot after deploying this would backfill every release ever written, all
/// stamped with today's ingest time, and the next newsletter would open with a
/// year of old announcements.
const MAX_AGE_DAYS = Number(process.env.RELEASE_SIGNAL_MAX_AGE_DAYS ?? '') || 45;

export interface ReleaseItem {
  /// Heading date, as epoch ms.
  publishedAt: number;
  /// The `##` heading verbatim, for the external id.
  dateHeading: string;
  title: string;
  body: string;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/// Parse `## <date>` sections and the `###` items under them.
///
/// Exported for the tests: a parser that is only exercised through a watcher is
/// a parser nobody checks against a real file.
export function parseReleaseNotes(markdown: string): ReleaseItem[] {
  const items: ReleaseItem[] = [];
  const lines = markdown.split('\n');

  let dateHeading = '';
  let publishedAt = NaN;
  let title = '';
  let body: string[] = [];

  const flush = () => {
    if (title && Number.isFinite(publishedAt)) {
      items.push({ publishedAt, dateHeading, title, body: body.join('\n').trim() });
    }
    title = '';
    body = [];
  };

  for (const line of lines) {
    const dateMatch = /^##\s+(?!#)(.*)$/.exec(line);
    if (dateMatch) {
      flush();
      dateHeading = dateMatch[1]!.trim();
      // "July 27, 2026" parses natively. A heading that does not parse is
      // skipped rather than guessed at, because a wrong date on a citation is
      // worse than a missing signal.
      const parsed = Date.parse(`${dateHeading} 12:00:00 UTC`);
      publishedAt = Number.isNaN(parsed) ? NaN : parsed;
      continue;
    }

    const itemMatch = /^###\s+(.*)$/.exec(line);
    if (itemMatch) {
      flush();
      title = itemMatch[1]!.trim();
      continue;
    }

    if (title) body.push(line);
  }
  flush();

  return items;
}

/// First paragraph, normalised. The release notes are written in prose, so the
/// opening paragraph is already the summary somebody wrote on purpose.
function summarise(body: string): string {
  const paragraph = body.trim().split(/\n\s*\n/)[0] ?? '';
  return paragraph.replace(/\s+/g, ' ').trim();
}

function findFile(): string | null {
  for (const path of CANDIDATE_PATHS) {
    if (existsSync(path)) return path;
  }
  return null;
}

export interface IngestReport {
  found: number;
  added: number;
  duplicate: number;
  tooOld: number;
}

export async function ingestReleaseNotes(now = Date.now()): Promise<IngestReport> {
  const path = findFile();
  if (!path) {
    logger.warn(
      { tried: CANDIDATE_PATHS },
      'release notes not found; Karwan releases will not enter the signal pipeline',
    );
    return { found: 0, added: 0, duplicate: 0, tooOld: 0 };
  }

  const items = parseReleaseNotes(readFileSync(path, 'utf8'));
  const cutoff = now - MAX_AGE_DAYS * 86_400_000;
  const report: IngestReport = { found: items.length, added: 0, duplicate: 0, tooOld: 0 };

  for (const item of items) {
    if (item.publishedAt < cutoff) {
      report.tooOld += 1;
      continue;
    }

    const result = await addSignal({
      origin: 'karwan',
      source: 'Karwan release',
      title: item.title,
      publishedAt: item.publishedAt,
      summary: summarise(item.body),
      // Our own writing, so the whole section is fair to keep. The store clamps
      // it anyway, which keeps one rule in one place.
      rawExcerpt: item.body,
      tags: ['karwan', 'release'],
      importance: 'high',
      // Date plus title, so re-reading the same file on every boot collides
      // instead of accumulating. Editing a heading creates a new signal, which
      // is the right call: a renamed release item is a different announcement.
      externalId: `${slug(item.dateHeading)}:${slug(item.title)}`,
    });

    if (result.duplicate) report.duplicate += 1;
    else report.added += 1;
  }

  logger.info({ path, ...report }, 'release notes ingested');
  return report;
}

/// Run once at startup. Returns a no-op stopper so it composes with the other
/// watchers in index.ts, none of which know that this one has nothing to stop.
export function startReleaseWatcher(): () => void {
  ingestReleaseNotes().catch((err: unknown) => {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'release notes ingest failed',
    );
  });
  return () => {};
}
