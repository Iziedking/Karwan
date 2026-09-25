const TITLE_MAX = 80;

/// The first line of the brief, trimmed. Mirrors backend agents/bidOutcome.ts.
export function requestTitle(briefText?: string | null): string | null {
  const first = (briefText ?? '').trim().split('\n')[0]?.trim() ?? '';
  if (!first) return null;
  return first.length > TITLE_MAX ? first.slice(0, TITLE_MAX) : first;
}
