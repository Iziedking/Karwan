import { createHash } from 'node:crypto';
import { GENERIC_TAG_WORDS, textWords, topicalOverlap } from '../llm/keywords.js';
import { pgEnabled, postgresExecutor } from './client.js';

/// Pairs the model judge matched that share no word, even through the word map
/// (view 95). The team reads them on /admin/word-map and adds the good ones to
/// backend/src/matching/wordMap.ts. Only words are kept: no names, no
/// addresses, no request ids.

export interface WordMapSuggestion {
  id: string;
  briefWords: string[];
  sellerWords: string[];
  count: number;
  firstSeen: number;
  lastSeen: number;
}

interface Kept extends WordMapSuggestion {
  status: 'open' | 'dismissed';
}

const WORDS_MAX = 12;
const kept = new Map<string, Kept>();

export function resetWordMapSuggestionsForTests(): void {
  kept.clear();
}

const wordsOf = (tags: readonly string[]): string[] =>
  [...new Set(tags.flatMap(textWords).filter((w) => !GENERIC_TAG_WORDS.has(w)))].sort().slice(0, WORDS_MAX);

const idOf = (brief: string[], seller: string[]): string =>
  createHash('sha256').update(`${brief.join(' ')}\u0000${seller.join(' ')}`).digest('hex').slice(0, 24);

/// Keep a pair the judge matched. The same pair adds to its count; a dismissed
/// pair stays dismissed.
export async function recordSuggestion(briefTags: readonly string[], sellerTags: readonly string[], now = Date.now()): Promise<void> {
  const brief = wordsOf(briefTags);
  const seller = wordsOf(sellerTags);
  if (brief.length === 0 || seller.length === 0) return;
  if (topicalOverlap([...briefTags], [...sellerTags]) > 0) return;
  const id = idOf(brief, seller);
  if (!pgEnabled) {
    const row = kept.get(id);
    if (row) {
      row.count += 1;
      row.lastSeen = now;
    } else {
      kept.set(id, { id, briefWords: brief, sellerWords: seller, count: 1, firstSeen: now, lastSeen: now, status: 'open' });
    }
    return;
  }
  await postgresExecutor().query(
    `INSERT INTO word_map_suggestions_v1 (id, brief_words, seller_words, count, first_seen, last_seen, status)
     VALUES ($1, $2, $3, 1, $4, $4, 'open')
     ON CONFLICT (id) DO UPDATE SET count = word_map_suggestions_v1.count + 1, last_seen = EXCLUDED.last_seen`,
    [id, JSON.stringify(brief), JSON.stringify(seller), now],
  );
}

type Row = { id: string; brief_words: string[]; seller_words: string[]; count: number | string; first_seen: number | string; last_seen: number | string };

/// The open suggestions, most frequent first, then most recent.
export async function listOpenSuggestions(limit = 100): Promise<WordMapSuggestion[]> {
  if (!pgEnabled) {
    return [...kept.values()]
      .filter((s) => s.status === 'open')
      .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
      .slice(0, limit)
      .map(({ status: _status, ...s }) => s);
  }
  const r = await postgresExecutor().query<Row>(
    `SELECT id, brief_words, seller_words, count, first_seen, last_seen FROM word_map_suggestions_v1
     WHERE status = 'open' ORDER BY count DESC, last_seen DESC LIMIT $1`,
    [limit],
  );
  return r.rows.map((x) => ({
    id: x.id,
    briefWords: x.brief_words,
    sellerWords: x.seller_words,
    count: Number(x.count),
    firstSeen: Number(x.first_seen),
    lastSeen: Number(x.last_seen),
  }));
}

/// Put a suggestion away for good. False when there was no open one by that id.
export async function dismissSuggestion(id: string): Promise<boolean> {
  if (!pgEnabled) {
    const row = kept.get(id);
    if (!row || row.status !== 'open') return false;
    row.status = 'dismissed';
    return true;
  }
  const r = await postgresExecutor().query(
    `UPDATE word_map_suggestions_v1 SET status = 'dismissed' WHERE id = $1 AND status = 'open' RETURNING id`,
    [id],
  );
  return r.rows.length === 1;
}
