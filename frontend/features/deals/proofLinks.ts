export interface ProofSegment {
  text: string;
  href?: string;
}

const LINK_CANDIDATE =
  /https?:\/\/[^\s<]+|(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:\/[^\s<]*)?/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)}\]]$/;

function safeHref(candidate: string): string | null {
  const value = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/// Converts cleared delivery proof into safe, display-preserving link segments.
/// Bare domains are accepted because counterparties often paste `example.com`
/// rather than a full URL. Email domains and unsafe schemes remain plain text.
export function proofSegments(text: string): ProofSegment[] {
  const result: ProofSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(LINK_CANDIDATE)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const hasProtocol = /^https?:\/\//i.test(raw);
    if (!hasProtocol && start > 0 && /[@\w]/.test(text[start - 1])) continue;

    let linkText = raw;
    while (linkText.length > 0 && TRAILING_PUNCTUATION.test(linkText)) {
      linkText = linkText.slice(0, -1);
    }
    const href = safeHref(linkText);
    if (!href) continue;

    if (start > cursor) result.push({ text: text.slice(cursor, start) });
    result.push({ text: linkText, href });
    const suffix = raw.slice(linkText.length);
    if (suffix) result.push({ text: suffix });
    cursor = start + raw.length;
  }

  if (cursor < text.length) result.push({ text: text.slice(cursor) });
  return result.length > 0 ? result : [{ text }];
}
