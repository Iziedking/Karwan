import type { Listing } from '@/core/api';
import type { MarketShopCopy } from '@/shared/i18n/messages/marketShop';

/// What the listing page says about an offer (view 44, Figma 02 and D2).

/// The offer's own parts in plain words, then its conditions.
export function whatYouGet(listing: Listing): string[] {
  const draft = listing.termsDraft;
  if (!draft) return [];
  const parts = draft.parts.map((part) => part.what?.trim()).filter((what): what is string => !!what);
  return [...parts, ...draft.conditions.map((c) => c.trim()).filter(Boolean)];
}

export function howYouPay(listing: Listing, t: MarketShopCopy): string {
  const parts = listing.termsDraft?.parts.length ?? 1;
  return parts > 1 ? t.listing.inParts.replace('{n}', String(parts)) : t.listing.onePayment;
}

export function howItWorks(name: string, kind: Listing['deliveryKind'], t: MarketShopCopy): [string, string, string] {
  const middle = kind === 'goods' ? t.listing.stepGoods : kind === 'in_person' ? t.listing.stepInPerson : t.listing.stepRemote;
  return [t.listing.stepPay, middle.replace('{name}', name), t.listing.stepRelease.replace('{name}', name)];
}

/// The seller's country in the reader's language. The two-letter country is
/// the only location anyone else sees; a code that is not one shows nothing.
export function countryName(code: string | null | undefined, locale: string): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? name : null;
  } catch {
    return null;
  }
}
