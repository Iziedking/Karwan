/// Web links inside text people wrote: a deal chat message or a delivery note.
/// Only http and https links, or ones written as www., are ever made clickable.

export const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?)\]}]+$/;

/// The address a written link opens, or null when it is not a web link.
export function linkHref(written: string): string | null {
  try {
    const url = new URL(/^www\./i.test(written) ? `https://${written}` : written);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export type TextPart = { text: string; href?: string };

export function textParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  const push = (t: string) => {
    if (!t) return;
    const prev = parts[parts.length - 1];
    if (prev && !prev.href) prev.text += t;
    else parts.push({ text: t });
  };
  for (const m of text.matchAll(LINK_RE)) {
    const raw = m[0];
    const link = raw.replace(TRAILING, '');
    const href = linkHref(link);
    push(text.slice(last, m.index));
    if (href) {
      parts.push({ text: link, href });
      push(raw.slice(link.length));
    } else {
      push(raw);
    }
    last = (m.index ?? 0) + raw.length;
  }
  push(text.slice(last));
  return parts;
}
