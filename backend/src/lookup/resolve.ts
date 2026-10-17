/// Who a lookup means: a Karwan tag first, then a Telegram username, but only
/// for someone who allowed people to find them by it.

export interface ResolveDeps {
  byTag: (tag: string) => Promise<string | null>;
  byTelegram: (username: string) => Promise<{ address: string; findable: boolean } | null>;
}

export async function resolveLookup(raw: string, deps: ResolveDeps): Promise<{ address: string; via: 'tag' | 'telegram' } | null> {
  const name = raw.trim().replace(/^@/, '').toLowerCase();
  if (!name) return null;
  const byTag = await deps.byTag(name);
  if (byTag) return { address: byTag.toLowerCase(), via: 'tag' };
  const tg = await deps.byTelegram(name);
  if (tg?.findable) return { address: tg.address.toLowerCase(), via: 'telegram' };
  return null;
}
