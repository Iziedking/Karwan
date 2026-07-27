/// Pulls candidate URLs out of a free-text delivery proof. Sellers paste a
/// link (sometimes several, sometimes wrapped in a sentence), so we scan for
/// http(s) tokens, normalise them through the URL constructor, and dedupe.
/// No regex-only parsing of the URL internals: we let the platform URL parser
/// validate, which avoids the classic hand-rolled-regex bypasses.

const URL_TOKEN = /\bhttps?:\/\/[^\s<>"')]+/gi;

/// Bare host, no scheme: `karwan.site`, `drive.google.com/file/d/x`. People
/// paste these constantly and it is a poor reason to reject a delivery.
///
/// Deliberately conservative, because prose is full of dotted tokens that are
/// not domains. `Microsoft.Services.Store.winmd` and `report.pdf` both look
/// like hosts to a naive pattern. Two guards: the last label must be a
/// plausible TLD shape, and anything whose last label is a known file
/// extension is rejected outright. Whatever survives still has to resolve in
/// DNS before it counts, so a wrong guess here fails closed rather than
/// admitting a fake host.
const BARE_HOST =
  /(?<![\w@/.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(\/[^\s<>"')]*)?/gi;

/// Extensions that show up in delivery notes and would otherwise read as TLDs.
const FILE_EXT = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'json',
  'xml', 'zip', 'rar', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4',
  'mov', 'mp3', 'wav', 'ts', 'js', 'tsx', 'jsx', 'py', 'go', 'rs', 'sol',
  'md', 'yml', 'yaml', 'toml', 'lock', 'log', 'winmd', 'dll', 'exe', 'sh',
]);

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

  // Second pass for scheme-less hosts. Runs after the scheme pass so anything
  // already captured is deduped by the same key and never double-counted.
  for (const m of text.matchAll(BARE_HOST)) {
    const hostPart = m[1];
    if (!hostPart) continue;
    const lastLabel = hostPart.split('.').pop()?.toLowerCase() ?? '';
    if (FILE_EXT.has(lastLabel)) continue;
    let parsed: URL;
    try {
      parsed = new URL(`https://${hostPart}${m[2] ?? ''}`);
    } catch {
      continue;
    }
    const host = parsed.hostname.toLowerCase();
    const key = `${host}${parsed.pathname}${parsed.search}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ href: parsed.toString(), host });
  }
  return out;
}
