/// Flatten markdown to plain text for surfaces that don't render it (the admin
/// support thread). **bold**, *italic*, `code`, and [label](url) become plain.
export function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\s)\*(\S.*?\S)\*(?=\s|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

export function shortHash(h: string, head = 6, tail = 4): string {
  if (!h) return '-';
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export function shortAddress(h?: string | null): string {
  if (!h) return '-';
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export function formatUsdc(
  value: string | number | null | undefined,
  opts?: { withSuffix?: boolean },
): string {
  if (value == null || value === '') return '-';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '-';
  const fixed = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return opts?.withSuffix === false ? fixed : `${fixed} USDC`;
}

const RELATIVE_UNITS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [2_592_000_000, 'month'],
  [86_400_000, 'day'],
  [3_600_000, 'hour'],
  [60_000, 'minute'],
];

/// "3 days ago", "in 17 days", in the reader's language.
export function relativeTime(unixMsOrSec: number, locale: string): string {
  const ms = unixMsOrSec > 10_000_000_000 ? unixMsOrSec : unixMsOrSec * 1000;
  const diff = ms - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  for (const [size, unit] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= size) return rtf.format(Math.round(diff / size), unit);
  }
  return rtf.format(0, 'second');
}

export function explorerTxUrl(explorerBase: string, txHash: string): string {
  return `${explorerBase}/tx/${txHash}`;
}
