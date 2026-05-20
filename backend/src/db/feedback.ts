// Tester feedback store. Records (text + metadata) persist to a flat JSON file
// like the briefs store; screenshots are written as separate image files under
// data/feedback-assets/<id>/<n>.<ext> so the JSON stays small and the bytes can
// be served directly. Postgres-backed in a future iteration.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';

export type FeedbackCategory = 'bug' | 'improvement' | 'other' | 'praise';
export type FeedbackStatus = 'new' | 'triaged' | 'resolved';

export interface FeedbackScreenshot {
  /// File extension without the dot, e.g. 'png' | 'jpg' | 'webp'.
  ext: string;
  mime: string;
  bytes: number;
}

export interface Feedback {
  id: string;
  category: FeedbackCategory;
  title: string;
  message: string;
  /// Optional way for the tester to be reached back. Email or handle, free text.
  contact?: string;
  /// Auto-captured context: where they were and on what client.
  context?: { url?: string; wallet?: string; userAgent?: string };
  screenshots: FeedbackScreenshot[];
  createdAt: number;
  status: FeedbackStatus;
}

/// Decoded screenshot ready to write to disk. Passed in by the route after it
/// validates and base64-decodes the data URLs.
export interface DecodedScreenshot {
  buffer: Buffer;
  mime: string;
  ext: string;
}

const DATA_DIR = resolve(process.cwd(), 'data');
const STORE_PATH = join(DATA_DIR, 'feedback.json');
const ASSET_DIR = join(DATA_DIR, 'feedback-assets');

const store = new Map<string, Feedback>();
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(STORE_PATH)) return;
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const obj = JSON.parse(raw) as Record<string, Feedback>;
    for (const [k, v] of Object.entries(obj)) store.set(k, v);
    logger.info({ count: store.size }, 'feedback loaded from disk');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'feedback load failed, starting empty');
  }
}

function persist(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const obj: Record<string, Feedback> = {};
    for (const [k, v] of store.entries()) obj[k] = v;
    writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'feedback persist failed');
  }
}

export interface CreateFeedbackInput {
  category: FeedbackCategory;
  title: string;
  message: string;
  contact?: string;
  context?: { url?: string; wallet?: string; userAgent?: string };
}

/// Persists a feedback record and writes its screenshots to disk. The decoded
/// images are written first; if a write fails that screenshot is dropped from
/// the record rather than failing the whole submission.
export function createFeedback(
  input: CreateFeedbackInput,
  images: DecodedScreenshot[],
): Feedback {
  load();
  const id = randomUUID();
  const screenshots: FeedbackScreenshot[] = [];

  if (images.length > 0) {
    const dir = join(ASSET_DIR, id);
    try {
      mkdirSync(dir, { recursive: true });
      images.forEach((img, i) => {
        try {
          writeFileSync(join(dir, `${i}.${img.ext}`), img.buffer);
          screenshots.push({ ext: img.ext, mime: img.mime, bytes: img.buffer.length });
        } catch (err) {
          logger.warn(
            { err: (err as Error).message, id, index: i },
            'feedback screenshot write failed, dropping it',
          );
        }
      });
    } catch (err) {
      logger.warn({ err: (err as Error).message, id }, 'feedback asset dir create failed');
    }
  }

  const fb: Feedback = {
    id,
    category: input.category,
    title: input.title,
    message: input.message,
    ...(input.contact ? { contact: input.contact } : {}),
    ...(input.context ? { context: input.context } : {}),
    screenshots,
    createdAt: Date.now(),
    status: 'new',
  };
  store.set(id, fb);
  persist();
  return fb;
}

export function getFeedback(id: string): Feedback | null {
  load();
  return store.get(id) ?? null;
}

/// Newest-first list for the operator viewer.
export function listAllFeedback(): Feedback[] {
  load();
  return Array.from(store.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/// Reads a stored screenshot by feedback id and index. Returns null when the
/// record, the index, or the file is missing.
export function readFeedbackAsset(
  id: string,
  index: number,
): { buffer: Buffer; mime: string } | null {
  const fb = getFeedback(id);
  if (!fb) return null;
  const shot = fb.screenshots[index];
  if (!shot) return null;
  const file = join(ASSET_DIR, id, `${index}.${shot.ext}`);
  if (!existsSync(file)) return null;
  try {
    return { buffer: readFileSync(file), mime: shot.mime };
  } catch (err) {
    logger.warn({ err: (err as Error).message, id, index }, 'feedback asset read failed');
    return null;
  }
}

/// Marks a feedback item triaged/resolved. Used by the operator viewer.
export function setFeedbackStatus(id: string, status: FeedbackStatus): Feedback | null {
  load();
  const fb = store.get(id);
  if (!fb) return null;
  fb.status = status;
  store.set(id, fb);
  persist();
  return fb;
}
