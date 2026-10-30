import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '../logger.js';

/// Messages that asked to be paid outside Karwan (view 32), for the team. A
/// flag is a note, not an offense: it never touches the person's record.

export interface PayOutsideFlag {
  address: string;
  jobId: string;
  messageId: string;
  body: string;
  at: number;
}

const BODY_MAX = 500;
const REPEAT_WINDOW_MS = 30 * 86_400_000;
const REPEAT_AT = 3;

export function createPayOutsideFlags(file: string) {
  let rows: PayOutsideFlag[] | null = null;

  function all(): PayOutsideFlag[] {
    if (rows) return rows;
    rows = [];
    if (existsSync(file)) {
      try {
        rows = JSON.parse(readFileSync(file, 'utf8')) as PayOutsideFlag[];
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'pay-outside flags load failed, starting empty');
      }
    }
    return rows;
  }

  function record(flag: PayOutsideFlag): void {
    const list = all();
    if (list.some((f) => f.messageId === flag.messageId)) return;
    list.push({ ...flag, address: flag.address.toLowerCase(), body: flag.body.slice(0, BODY_MAX) });
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'pay-outside flags persist failed');
    }
  }

  /// Newest first. A sender flagged three times in 30 days is marked a repeat.
  function list(now: number): Array<PayOutsideFlag & { repeat: boolean }> {
    const recent = all().filter((f) => now - f.at < REPEAT_WINDOW_MS);
    return [...all()]
      .sort((a, b) => b.at - a.at)
      .map((f) => ({ ...f, repeat: recent.filter((r) => r.address === f.address).length >= REPEAT_AT }));
  }

  return { record, list };
}

export const payOutsideFlags = createPayOutsideFlags(resolve(process.cwd(), 'data', 'pay-outside-flags.json'));
