/**
 * Removes the old machine-style tag punctuation at the UI boundary.
 * Locale files stay compatible with existing callers while users see natural
 * labels. This deliberately does not remove ordinary square-bracket text.
 */
export function stripMechanicalTags(value: string): string {
  return value
    .replace(/\[:([^\]]*?):\]/g, '$1')
    .replace(/\[:([^\]]+)\]/g, '$1')
    .replace(/^\s*•\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Locale messages are plain nested records and arrays. Clone only those
 * containers so the source-of-truth locale objects remain untouched.
 */
export function cleanUiMessages<T>(value: T): T {
  if (typeof value === 'string') return stripMechanicalTags(value) as T;
  if (Array.isArray(value)) return value.map((item) => cleanUiMessages(item)) as T;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const cleaned = Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, cleanUiMessages(item)]),
    );
    return cleaned as T;
  }
  return value;
}
