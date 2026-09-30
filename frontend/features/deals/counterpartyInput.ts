/// What the "email or tag" field holds. An email has an @ with text on both
/// sides; anything shaped like a handle is a tag, looked up as a Karwan tag
/// first and a Paytag second.
export type ContactInput =
  | { kind: 'empty' }
  | { kind: 'email'; email: string }
  | { kind: 'tag'; tag: string; karwanShaped: boolean }
  | { kind: 'invalid' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE = /^[a-z0-9_-]{1,32}$/;
const KARWAN_TAG = /^[a-z](?:[a-z0-9]|_(?=[a-z0-9])){2,19}$/;

export function parseContact(raw: string): ContactInput {
  const text = raw.trim();
  if (text === '') return { kind: 'empty' };
  if (EMAIL.test(text)) return { kind: 'email', email: text.toLowerCase() };
  const tag = text.replace(/^@/, '').toLowerCase();
  if (!text.slice(1).includes('@') && HANDLE.test(tag)) return { kind: 'tag', tag, karwanShaped: KARWAN_TAG.test(tag) };
  return { kind: 'invalid' };
}

/// Who a tag turned out to be. A Karwan tag is paid at the account's address,
/// fixed when the deal is created; a Paytag is resolved and fixed by the server.
export type ContactMatch =
  | { kind: 'karwan'; tag: string; displayName: string; address: string }
  | { kind: 'paytag'; tag: string; maskedAddress: string };

type KarwanLookup =
  | { found: false; tag: string }
  | { found: true; self: boolean; tag: string; displayName: string; address: string };
type PaytagLookup = { found: boolean; handle?: string; maskedAddress?: string };

/// Karwan tag first, then Paytag when it is allowed. 'self' is the viewer's own
/// Karwan tag; null means nobody holds it.
export async function lookupContact(
  input: { tag: string; karwanShaped: boolean },
  opts: {
    paytagAllowed: boolean;
    karwan: (tag: string) => Promise<KarwanLookup>;
    paytag: (tag: string) => Promise<PaytagLookup>;
  },
): Promise<ContactMatch | 'self' | null> {
  if (input.karwanShaped) {
    const hit = await opts.karwan(input.tag);
    if (hit.found) {
      return hit.self ? 'self' : { kind: 'karwan', tag: hit.tag, displayName: hit.displayName, address: hit.address };
    }
  }
  if (!opts.paytagAllowed) return null;
  const r = await opts.paytag(input.tag);
  return r.found && r.handle && r.maskedAddress ? { kind: 'paytag', tag: r.handle, maskedAddress: r.maskedAddress } : null;
}
