/// Pulls candidate URLs out of a free-text delivery proof. Sellers paste a
/// link (sometimes several, sometimes wrapped in a sentence), so we scan for
/// http(s) tokens, normalise them through the URL constructor, and dedupe.
/// No regex-only parsing of the URL internals: we let the platform URL parser
/// validate, which avoids the classic hand-rolled-regex bypasses.

const URL_TOKEN = /\bhttps?:\/\/[^\s<>"')]+/gi;

export interface ExtractedUrl {
  /// Normalised absolute URL (origin + path + search), lower-cased host.
  href: string;
  host: string;
}

export function extractUrls(text: string): ExtractedUrl[] {
  if (!text) return [];
  const out: ExtractedUrl[] = [];
  const seen = new Set<string>();
  const matches = text.match(URL_TOKEN) ?? [];
  for (const raw of matches) {
    // Trim trailing punctuation that commonly rides along in prose.
    const cleaned = raw.replace(/[.,;:!?]+$/, '');
    let parsed: URL;
    try {
      parsed = new URL(cleaned);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    const host = parsed.hostname.toLowerCase();
    const key = `${host}${parsed.pathname}${parsed.search}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ href: parsed.toString(), host });
  }
  return out;
}
