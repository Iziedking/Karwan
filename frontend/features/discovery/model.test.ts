import assert from 'node:assert/strict';
import test from 'node:test';
import type { Listing, MarketplaceBrief, Partner } from '@/core/api';
import {
  buildDiscoveryCards,
  splitRequestText,
  discoveryRail,
  filterDiscoveryCards,
  filterPartners,
} from './model';

const NOW = 1_800_000_000_000;

const listings: Listing[] = [
  {
    id: 'offer-open',
    sellerUser: '0x1111111111111111111111111111111111111111',
    sellerAgent: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    title: 'Textile quality inspection',
    description: 'Factory inspection for apparel shipments.',
    askingPriceUsdc: 240,
    postedAt: NOW - 1_000,
    expiresAt: NOW + 86_400_000,
  },
  {
    id: 'offer-business',
    sellerUser: '0x2222222222222222222222222222222222222222',
    sellerAgent: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    title: 'Freight coordination',
    description: 'Cross-border logistics support.',
    askingPriceUsdc: 400,
    postedAt: NOW - 2_000,
    expiresAt: NOW + 86_400_000,
    partyKind: 'business',
    tradeLane: 'service',
    matchedAt: NOW - 500,
  },
  {
    id: 'offer-expired',
    sellerUser: '0x3333333333333333333333333333333333333333',
    sellerAgent: '0xcccccccccccccccccccccccccccccccccccccccc',
    title: 'Expired offer',
    description: 'Must not render.',
    askingPriceUsdc: 1,
    postedAt: NOW - 3_000,
    expiresAt: NOW - 1,
  },
];

const briefs: MarketplaceBrief[] = [
  {
    jobId: 'request-finance',
    buyer: '0x4444…5555',
    budgetUsdc: '1000',
    deadlineUnix: Math.floor((NOW + 172_800_000) / 1000),
    briefText: 'Purchase order support\nNeed a verified textile supplier.',
    bidsCount: 2,
    postedAt: NOW - 500,
    partyKind: 'business',
    tradeLane: 'finance',
  },
];

test('buildDiscoveryCards removes terminal entries and preserves honest metadata', () => {
  const cards = buildDiscoveryCards(listings, briefs, {
    now: NOW,
    viewerAddress: listings[0]!.sellerUser,
  });
  assert.deepEqual(cards.map((card) => card.id), [
    'request-finance',
    'offer-open',
    'offer-business',
  ]);
  assert.equal(cards.find((card) => card.id === 'offer-open')?.partyIsYou, true);
  assert.equal(cards.find((card) => card.id === 'offer-business')?.matchedBefore, true);
  assert.equal(cards.find((card) => card.id === 'request-finance')?.body,
    'Need a verified textile supplier.');
});

test('filters support search, side, scope, audience, and deterministic price sorting', () => {
  const cards = buildDiscoveryCards(listings, briefs, { now: NOW });
  const searched = filterDiscoveryCards(
    cards,
    { query: 'textile supplier', side: 'request', scope: 'business', sort: 'newest' },
    'public',
  );
  assert.deepEqual(searched.map((card) => card.id), ['request-finance']);

  const personOffers = filterDiscoveryCards(
    cards,
    { query: '', side: 'offer', scope: 'services', sort: 'price-asc' },
    'person',
  );
  assert.deepEqual(personOffers.map((card) => card.id), ['offer-open', 'offer-business']);

  // One market: a business sees every card; the Businesses filter narrows.
  const businessView = filterDiscoveryCards(
    cards,
    { query: '', side: 'all', scope: 'all', sort: 'price-desc' },
    'business',
  );
  const everyone = filterDiscoveryCards(cards, { query: '', side: 'all', scope: 'all', sort: 'price-desc' }, 'person');
  assert.deepEqual(businessView.map((card) => card.id), everyone.map((card) => card.id));
  assert.ok(businessView.length > 2, 'personal cards are included');

  const businessesOnly = filterDiscoveryCards(cards, { query: '', side: 'all', scope: 'business', sort: 'price-desc' }, 'business');
  assert.deepEqual(businessesOnly.map((card) => card.id), ['request-finance', 'offer-business']);
});

test('rail classification separates personal, hiring, and business trades', () => {
  const cards = buildDiscoveryCards(listings, briefs, { now: NOW });
  assert.equal(discoveryRail(cards.find((card) => card.id === 'offer-open')!), 'personal');
  assert.equal(discoveryRail(cards.find((card) => card.id === 'offer-business')!), 'hiring');
  assert.equal(discoveryRail(cards.find((card) => card.id === 'request-finance')!), 'business');
});

test('partner filters search real profile fields and keep trust sorting explicit', () => {
  const partners: Partner[] = [
    {
      address: '0x1',
      name: 'Zed Logistics',
      sector: 'logistics',
      region: 'Lagos',
      primaryMarkets: 'West Africa',
      minOrderValue: null,
      leadTimeDays: null,
      certifications: null,
      verified: false,
      canSupply: true,
    },
    {
      address: '0x2',
      name: 'Atlas Textiles',
      sector: 'textiles',
      region: 'Dubai',
      primaryMarkets: 'GCC',
      minOrderValue: '10000',
      leadTimeDays: 14,
      certifications: 'ISO 9001',
      verified: true,
      canSupply: true,
    },
  ];

  const result = filterPartners(partners, {
    query: 'gcc',
    sector: '',
    verifiedOnly: true,
    sort: 'trust',
  });
  assert.deepEqual(result.map((partner) => partner.name), ['Atlas Textiles']);
});

test('a request reads as its first sentence, with the rest as the detail, never cut mid-word', () => {
  assert.deepEqual(
    splitRequestText('Need an escrow contract for freelance milestones, with tests. It is for an online shop selling to customers in Mexico.'),
    { title: 'Need an escrow contract for freelance milestones, with tests.', body: 'It is for an online shop selling to customers in Mexico.' },
  );
  assert.deepEqual(splitRequestText('Need a flyer for a pop-up market.'), { title: 'Need a flyer for a pop-up market.', body: '' });
  assert.deepEqual(splitRequestText('First line' + String.fromCharCode(10) + 'Second line'), { title: 'First line', body: 'Second line' });

  const text = `Need ${'very '.repeat(40)}long help`;
  const long = splitRequestText(text);
  assert.ok(long.title.endsWith('…') && long.title.length <= 101, long.title);
  const kept = long.title.slice(0, -1);
  assert.equal(text.charAt(kept.length), ' ', 'cut falls on a space, not inside a word');
  assert.equal(`${kept} ${long.body}`, text);
});

test('a request card counts agent bids and direct offers together', () => {
  const cards = buildDiscoveryCards(listings, [{ ...briefs[0]!, bidsCount: 2, offerCount: 3 }], { now: NOW });
  assert.equal(cards.find((card) => card.id === 'request-finance')?.bidsCount, 5);
  const none = buildDiscoveryCards(listings, [{ ...briefs[0]!, bidsCount: 0 }], { now: NOW });
  assert.equal(none.find((card) => card.id === 'request-finance')?.bidsCount, 0);
});

test('seeded example stock stays marked as an example on its card, and real rows do not', () => {
  const cards = buildDiscoveryCards(
    [{ ...listings[0], id: 'offer-example', example: true }, listings[0]],
    [{ ...briefs[0], jobId: 'request-example', example: true }],
    { now: NOW },
  );
  const byId = new Map(cards.map((card) => [card.id, card.example]));
  assert.equal(byId.get('offer-example'), true);
  assert.equal(byId.get('offer-open'), false);
  assert.equal(byId.get('request-example'), true);
});

test('the market says how results are ordered, behind a tip by the sort, for whichever sort is chosen', async () => {
  const { orderNoteKey } = await import('./model');
  assert.equal(orderNoteKey('newest'), 'newest');
  assert.equal(orderNoteKey('price-asc'), 'lowestPrice');
  assert.equal(orderNoteKey('price-desc'), 'highestPrice');
  const { readFileSync } = await import('node:fs');
  const browse = readFileSync(new URL('../listings/components/ListingsBrowse.tsx', import.meta.url), 'utf8');
  assert.match(browse, /<Hint[^>]*><span data-market-order>\{copy\.order\[orderNoteKey\(sort\)\]\}/);
  const { en } = await import('@/shared/i18n/messages/en');
  for (const line of Object.values(en.listingsBrowse.order)) {
    assert.match(line, /no one pays to appear higher/i);
    assert.doesNotMatch(line, /—/);
  }
});

test('an offer card carries its first photo link; one without photos carries none', () => {
  const withPhoto = { ...listings[0]!, photoUrls: ['/api/listings/offer-open/photos/0?v=1', '/api/listings/offer-open/photos/1?v=1'] } as Listing;
  const cards = buildDiscoveryCards([withPhoto, ...listings.slice(1)], briefs, { now: NOW });
  assert.equal(cards.find((c) => c.id === 'offer-open')?.photo, '/api/listings/offer-open/photos/0?v=1');
  assert.ok(cards.filter((c) => c.id !== 'offer-open').every((c) => c.photo === undefined));
});
