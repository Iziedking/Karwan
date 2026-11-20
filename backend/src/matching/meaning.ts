import { createHash } from 'node:crypto';
import { config } from '../config.js';

/// Matching by meaning (view 95 phase 2): how close two meaning vectors are,
/// as a score from 0 to 100 above a threshold set by the probe.

export type MeaningSettings = Pick<
  typeof config,
  'MEANING_VECTORS_ENABLED' | 'BEDROCK_ENABLED' | 'MEANING_MODEL' | 'MEANING_THRESHOLD' | 'MEANING_DIMENSION'
>;

/// On only with the switch, Bedrock, a model and a threshold.
export function meaningOn(c: MeaningSettings = config): boolean {
  return c.MEANING_VECTORS_ENABLED && c.BEDROCK_ENABLED && !!c.MEANING_MODEL && c.MEANING_THRESHOLD !== undefined;
}

/// The model and dimension a vector was made with. Vectors under another key are never mixed in.
export function modelKey(c: MeaningSettings = config): string | null {
  return meaningOn(c) ? `${c.MEANING_MODEL}@${c.MEANING_DIMENSION}` : null;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const c = dot / Math.sqrt(na * nb);
  return Number.isFinite(c) ? c : 0;
}

/// 0 at or below the threshold, rising to 100 at a similarity of 1.
export function meaningScore(a: Float32Array | null, b: Float32Array | null, threshold: number): number {
  if (!a || !b || threshold >= 1) return 0;
  const c = cosine(a, b);
  if (c <= threshold) return 0;
  return Math.max(0, Math.min(100, Math.round((100 * (c - threshold)) / (1 - threshold))));
}

/// What is stored in place of the text.
export function textHash(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}
