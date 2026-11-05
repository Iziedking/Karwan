/// How long a guide line stays up (view 54): long enough to read twice, about
/// 300ms a word plus 2 seconds, never under 4 seconds and never over 9.
export function readingMs(words: number): number {
  return Math.min(9_000, Math.max(4_000, words * 300 + 2_000));
}
