import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrivateLocation } from '../location/rules.js';
import { LEADS_MAX, rankBuyersFor, type LeadCandidate, type LeadSeller } from './rankBuyers.js';

/// The buyers a seller's agent finds (view 72, Phase 4): open requests and the
/// needs of buyers who let sellers reach them, never anything private.

const WUSE = { lat: 9.07, lng: 7.479 };
const MAITAMA = { lat: 9.09, lng: 7.491 };
const GWARINPA = { lat: 9.11, lng: 7.4 };
const LAGOS = { lat: 6.507, lng: 3.375 };

const at = (city: string, point: { lat: number; lng: number }): PrivateLocation => ({
  country: 'NG', city, area: 'somewhere private', reach: {}, point: { ...point, precision: 'area', source: 'osm', at: 1 },
});

const caterer: LeadSeller = {
  user: '0xcaterer', words: ['catering', 'lunch', 'food'], meet: { atMyPlace: false, comeToYouKm: 15, online: false },
  location: at('Abuja', WUSE), verified: true, priceMin: 30,
};

const lead = (ref: string, over: Partial<LeadCandidate> = {}): LeadCandidate => ({
  kind: 'need', ref, buyer: `0x${ref}`, what: 'lunch for 20 every Friday', keywords: ['lunch', 'catering'], budgetUsdc: 40, every: 'week',
  deliveryKind: 'in_person', where: { scope: 'near' }, buyerLocation: at('Abuja', MAITAMA), buyerVerified: false, buyerTier: 'ESTABLISHED',
  dueDays: null, open: true, contactFrom: 'anyone', ...over,
});

const refs = (rows: { ref: string }[]) => rows.map((r) => r.ref);
const rank = (leads: LeadCandidate[], seller = caterer, blocked = new Set<string>()) => rankBuyersFor(leads, seller, { blocked });

test('private requests and paused or unreachable needs never appear', () => {
  const rows = rank([
    lead('invited', { kind: 'request', open: false }),
    lead('paused', { open: false }),
    lead('reachable'),
  ]);
  assert.deepEqual(refs(rows), ['reachable']);
});

test('their own requests, blocked buyers and buyers who take verified sellers only are skipped', () => {
  const rows = rank(
    [lead('mine', { buyer: '0xCATERER' }), lead('blocked'), lead('picky', { contactFrom: 'verified' }), lead('ok')],
    { ...caterer, verified: false },
    new Set(['0xblocked']),
  );
  assert.deepEqual(refs(rows), ['ok']);
});

test('skill fit first, then distance, then the buyer record', () => {
  const rows = rank([
    lead('far', { buyerLocation: at('Abuja', GWARINPA) }),
    lead('close'),
    lead('shoes', { what: 'shoe repair', keywords: ['shoes', 'repair'] }),
    lead('verified-far', { buyerLocation: at('Abuja', GWARINPA), buyerVerified: true }),
  ]);
  assert.deepEqual(refs(rows), ['close', 'verified-far', 'far']);
});

test('in person they must reach the buyer; a budget under their lowest price is left out', () => {
  const rows = rank([lead('lagos', { buyerLocation: at('Lagos', LAGOS) }), lead('cheap', { budgetUsdc: 20 }), lead('ok')]);
  assert.deepEqual(refs(rows), ['ok']);
});

test('at most five, each with a rounded distance and no point, area or buyer name', () => {
  const rows = rank(Array.from({ length: 8 }, (_, i) => lead(`n${i}`)));
  assert.equal(rows.length, LEADS_MAX);
  assert.deepEqual(rows[0]!.distance, { key: 'about', km: 3 });
  const text = JSON.stringify(rows);
  assert.doesNotMatch(text, /lat|lng|somewhere private|point/);
});

test('online needs need a seller who works online, and carry no distance', () => {
  const remote = lead('site', { what: 'a website for my catering', keywords: ['catering', 'website'], deliveryKind: 'remote' });
  assert.deepEqual(refs(rank([remote])), []);
  const rows = rank([remote], { ...caterer, meet: { ...caterer.meet, online: true } });
  assert.deepEqual(rows[0]!.distance, { key: 'unknown' });
});
