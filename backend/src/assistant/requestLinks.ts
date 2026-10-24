/// A request posted from an assistant conversation remembers that conversation,
/// so its updates are written back there (view 30). The request card is built in
/// the conversation; the request is created when the person confirms it. This
/// holds the link in between, keyed by who posts what for how much.

const TTL_MS = 60 * 60 * 1000;

export interface RequestLink {
  conversationId: string | null;
  agreeForMe: boolean;
  at: number;
}

const links = new Map<string, RequestLink>();

const keyOf = (address: string, brief: string, budgetUsdc: number) =>
  `${address.toLowerCase()}|${brief.trim().toLowerCase()}|${Number(budgetUsdc)}`;

export function rememberRequestLink(address: string, brief: string, budgetUsdc: number, link: Omit<RequestLink, 'at'>, now = Date.now()): void {
  for (const [k, v] of links) if (now - v.at > TTL_MS) links.delete(k);
  links.set(keyOf(address, brief, budgetUsdc), { ...link, at: now });
}

/// The link for this request, once. Null when it was not posted from a card.
export function takeRequestLink(address: string, brief: string, budgetUsdc: number, now = Date.now()): RequestLink | null {
  const k = keyOf(address, brief, budgetUsdc);
  const link = links.get(k) ?? null;
  links.delete(k);
  return link && now - link.at <= TTL_MS ? link : null;
}

/// Records the link for every request card a turn prepared.
export function noteRequestCards(
  address: string,
  conversationId: string | undefined,
  actions: readonly { kind?: string; intent?: string; payload?: unknown }[] | undefined,
): void {
  for (const a of actions ?? []) {
    if (a.kind !== 'confirm' || a.intent !== 'post_request') continue;
    const p = a.payload as { brief?: string; budgetUsdc?: number; agreeForMe?: boolean } | undefined;
    if (!p?.brief || typeof p.budgetUsdc !== 'number') continue;
    rememberRequestLink(address, p.brief, p.budgetUsdc, { conversationId: conversationId ?? null, agreeForMe: p.agreeForMe === true });
  }
}
