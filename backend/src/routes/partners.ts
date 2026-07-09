import { Hono } from 'hono';
import { listProfiles, type UserProfile } from '../db/profiles.js';
import { sessionAddress } from '../auth/session.js';

/// B2B partner discovery. A directory of businesses that registered on the SME
/// rail, filterable by sourcing sector + region, so a business can find fellow
/// businesses to trade with. Distinct from /listings (the P2P offers feed): this
/// lists COMPANIES (their trade card), not individual service offers. It exposes
/// only the same public company fields the credit passport already shows, and a
/// business becomes discoverable by the act of registering + filling its card.

export const partnersRoutes = new Hono();

/// A profile belongs on the SME rail (business) when any of the three signals is
/// set — same predicate as accountKindOf, applied to an already-loaded profile
/// so we don't re-fetch per row.
function isBusinessProfile(p: UserProfile): boolean {
  return (
    p.accountKind === 'business' ||
    p.accountType === 'business' ||
    (!!p.business && p.business.status !== 'none')
  );
}

function toPartnerCard(p: UserProfile) {
  return {
    address: p.address,
    name: p.smeProfile?.companyName || p.displayName || 'Business',
    sector: p.smeProfile?.sector ?? null,
    region: p.smeProfile?.region ?? null,
    primaryMarkets: p.smeProfile?.primaryMarkets ?? null,
    minOrderValue: p.smeProfile?.minOrderValue ?? null,
    leadTimeDays: p.smeProfile?.leadTimeDays ?? null,
    certifications: p.smeProfile?.certifications ?? null,
    // Verified = Karwan-reviewed registration (the badge counterparties trust).
    verified: p.business?.status === 'verified' || p.accountType === 'business',
    // Whether they can act as a supplier (have a seller agent profile). A
    // business without one can still be a buyer-side partner, so this is a hint
    // on the card, not a filter.
    canSupply: !!p.seller,
  };
}

partnersRoutes.get('/', async (c) => {
  const sector = c.req.query('sector')?.trim().toLowerCase() || '';
  const region = c.req.query('region')?.trim().toLowerCase() || '';
  const self = sessionAddress(c);

  const all = await listProfiles();
  const partners = all
    // A discoverable partner is a business with a filled company card that has
    // not opted out. Exclude the caller's own company so a buyer never matches
    // themselves.
    .filter(
      (p) =>
        isBusinessProfile(p) &&
        p.smeProfile &&
        !p.smeProfile.hideFromDiscovery &&
        p.address !== self,
    )
    .filter((p) => !sector || (p.smeProfile?.sector ?? '').toLowerCase() === sector)
    .filter((p) => {
      if (!region) return true;
      const hay = `${p.smeProfile?.region ?? ''} ${p.smeProfile?.primaryMarkets ?? ''}`.toLowerCase();
      return hay.includes(region);
    })
    .map(toPartnerCard)
    // Verified companies first, then a stable order by name.
    .sort((a, b) => Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name))
    .slice(0, 60);

  return c.json({ partners });
});

/// Single-company lookup by wallet address. Backs the "open a deal with a
/// partner" flow: the buyer already picked the company, so the deal form seeds
/// the counterparty block from the same card the directory rendered. Ignores
/// hideFromDiscovery on purpose. That flag governs being *listed*, and every
/// field here already ships on the company's public credit passport.
partnersRoutes.get('/:address', async (c) => {
  const address = c.req.param('address').toLowerCase();
  const all = await listProfiles();
  const p = all.find((x) => x.address.toLowerCase() === address);
  if (!p || !isBusinessProfile(p) || !p.smeProfile) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json({ partner: toPartnerCard(p) });
});
