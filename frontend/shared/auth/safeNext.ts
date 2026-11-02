/// Where /start sends someone back to once they are in: a path on this site
/// only, never another site, and never /start itself.
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 4096) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (/[\s\u0000-\u001f\\]/.test(raw)) return null;
  try {
    const url = new URL(raw, 'https://karwan.invalid');
    if (url.origin !== 'https://karwan.invalid' || /^\/start(?:\/|$)/i.test(decodeURIComponent(url.pathname))) return null;
  } catch { return null; }
  return raw;
}
