import assert from 'node:assert/strict';
import test from 'node:test';
import type { Listing, MarketplaceBrief, Partner } from '@/core/api';
import {
  buildDiscoveryCards,
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

  const businessView = filterDiscoveryCards(
    cards,
    { query: '', side: 'all', scope: 'all', sort: 'price-desc' },
    'business',
  );
  assert.deepEqual(businessView.map((card) => card.id), ['request-finance', 'offer-business']);
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
