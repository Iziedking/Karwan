const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// Turns a pasted block of emails into a clean, de-duplicated list, and keeps
/// whatever did not look like an email so the admin sees it was not added.
export function parseEmailList(text: string): { valid: string[]; invalid: string[] } {
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (EMAIL_RE.test(e)) valid.add(e);
    else invalid.push(raw.trim());
  }
  return { valid: [...valid], invalid };
}
