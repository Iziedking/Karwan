/// Where /start sends someone back to once they are in: a path on this site
/// only, never another site, and never /start itself.
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 512) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (/[\s\u0000-\u001f\\]/.test(raw)) return null;
  if (raw === '/start' || raw.startsWith('/start?') || raw.startsWith('/start/')) return null;
  return raw;
}
