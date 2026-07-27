/// Carrier registry for physical-goods deliveries.
///
/// A services deal delivers a link the buyer can open, DNS-checked and scanned.
/// A goods deal used to deliver NOTHING: `deliveryProof` was optional and the
/// validation branch skipped `tradeType === 'goods'` entirely, so a seller could
/// mark a container delivered with an empty string and the buyer had no claim to
/// check and nothing to dispute against.
///
/// This does not pretend to verify a shipment with the carrier. It makes the
/// seller state WHO is carrying it and UNDER WHAT REFERENCE, in a shape that
/// resolves to a page the buyer can open. A checkable claim beats air, and it is
/// the honest thing to ship before a carrier-API integration exists.

export interface Carrier {
  slug: string;
  name: string;
  /// Where {n} is replaced by the tracking number. Null for `other`, which must
  /// supply its own URL instead.
  trackingUrl: string | null;
  /// Shape check only. Deliberately loose: a wrong-looking number should be
  /// rejected, but a carrier changing its format must not block a real
  /// shipment. The buyer opening the link is the real check.
  pattern: RegExp;
}

export const CARRIERS: readonly Carrier[] = [
  {
    slug: 'dhl',
    name: 'DHL',
    trackingUrl: 'https://www.dhl.com/global-en/home/tracking.html?tracking-id={n}',
    pattern: /^[0-9]{10,20}$/,
  },
  {
    slug: 'fedex',
    name: 'FedEx',
    trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr={n}',
    pattern: /^[0-9]{12,22}$/,
  },
  {
    slug: 'ups',
    name: 'UPS',
    trackingUrl: 'https://www.ups.com/track?tracknum={n}',
    pattern: /^1Z[0-9A-Z]{16}$|^[0-9]{9,18}$/i,
  },
  {
    slug: 'maersk',
    name: 'Maersk',
    trackingUrl: 'https://www.maersk.com/tracking/{n}',
    pattern: /^[0-9A-Z]{9,20}$/i,
  },
  {
    slug: 'msc',
    name: 'MSC',
    trackingUrl: 'https://www.msc.com/en/track-a-shipment?agencyPath=msc&trackingNumber={n}',
    pattern: /^[0-9A-Z]{9,20}$/i,
  },
  {
    slug: 'cma-cgm',
    name: 'CMA CGM',
    trackingUrl: 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}',
    pattern: /^[0-9A-Z]{9,20}$/i,
  },
  {
    slug: 'hapag-lloyd',
    name: 'Hapag-Lloyd',
    trackingUrl: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container={n}',
    pattern: /^[0-9A-Z]{9,20}$/i,
  },
  {
    /// Freight forwarders, regional couriers, and anything not listed. The
    /// seller supplies the tracking page themselves, and it is held to the SAME
    /// standard as a services delivery: the host must resolve in DNS. That is
    /// what stops "other" becoming the hole the whole check leaks through.
    slug: 'other',
    name: 'Other carrier',
    trackingUrl: null,
    pattern: /^.{3,60}$/,
  },
] as const;

export function findCarrier(slug: string): Carrier | undefined {
  return CARRIERS.find((c) => c.slug === slug.toLowerCase());
}

/// Resolve the page a buyer opens to check the shipment. Known carriers get a
/// built URL; `other` uses whatever the seller supplied.
export function trackingUrlFor(
  carrier: Carrier,
  trackingNumber: string,
  suppliedUrl?: string,
): string | null {
  if (carrier.trackingUrl) {
    return carrier.trackingUrl.replace('{n}', encodeURIComponent(trackingNumber));
  }
  return suppliedUrl ?? null;
}

/// Public shape for the carrier picker, without the regexes.
export function carrierOptions(): Array<{ slug: string; name: string; needsUrl: boolean }> {
  return CARRIERS.map((c) => ({ slug: c.slug, name: c.name, needsUrl: c.trackingUrl === null }));
}
