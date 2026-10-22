/// What the Account rows on Profile say beside their label. Setup already
/// asks what you do, how to reach you and your business name, so the rows show
/// those answers instead of "Set up" (owner, 21 Oct 2026).

export interface AccountRowFacts {
  email?: string | null;
  ownWords?: { what?: string };
  settings?: { notifyVia?: 'telegram' | 'email' | 'both' };
  businessDraft?: { name: string; trades: string };
  /// The business workspace's company name, when one is open.
  companyName?: string;
  hasBusiness?: boolean;
}

const MAX = 32;
const cut = (s: string) => (s.length > MAX ? `${s.slice(0, MAX).trimEnd()}…` : s);

export function accountRows(f: AccountRowFacts, words: { setUp: string; telegram: string }) {
  const what = f.ownWords?.what?.trim();
  const contact = f.email
    ? f.email
    : f.settings?.notifyVia === 'telegram'
      ? words.telegram
      : words.setUp;
  const business = f.hasBusiness ? f.companyName || undefined : f.businessDraft?.name?.trim() || words.setUp;
  return { agents: what ? cut(what) : words.setUp, contact, business };
}
