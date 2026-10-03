import assert from 'node:assert/strict';
import test from 'node:test';
import { liveUpdates, trendingCategories, updateInputSchema, type UpdateCard } from './model.js';

const card = (over: Partial<UpdateCard>): UpdateCard => ({
  id: 'u', order: 0, createdAt: 0, updatedAt: 0, kind: 'post', tag: 'Tech', title: 'Built on Arc', body: '',
  ctaLabel: 'Read', href: '/how-it-works', ground: 'mist', art: 0, active: true, ...over,
});

test('only active cards inside their window show, in order', () => {
  const now = 1_000;
  const live = liveUpdates([
    card({ id: 'b', order: 2 }),
    card({ id: 'a', order: 1 }),
    card({ id: 'off', active: false }),
    card({ id: 'later', startsAt: 2_000 }),
    card({ id: 'over', endsAt: 500 }),
  ], now);
  assert.deepEqual(live.map((c) => c.id), ['a', 'b']);
});

test('links are Karwan paths or https only', () => {
  const base = { tag: 'T', title: 'T', ctaLabel: 'Go' };
  assert.equal(updateInputSchema.safeParse({ ...base, href: '/how-it-works' }).success, true);
  assert.equal(updateInputSchema.safeParse({ ...base, href: 'https://community.arc.network/post/1' }).success, true);
  for (const bad of ['javascript:alert(1)', '//evil.test', 'http://plain.test', 'ftp://x']) {
    assert.equal(updateInputSchema.safeParse({ ...base, href: bad }).success, false, bad);
  }
});

test('trending counts real requests from the last week, once each', () => {
  const now = 10 * 86_400_000;
  const day = 86_400_000;
  const trending = trendingCategories([
    { keywords: ['Logo', 'design', 'logo'], createdAt: now - day },
    { keywords: ['logo', 'branding'], createdAt: now - 2 * day },
    { keywords: ['translation'], createdAt: now - 3 * day },
    { keywords: ['logo'], createdAt: now - 9 * day },
    { keywords: ['logo'], createdAt: now - day, seedKey: 'seed-1' },
  ], now);
  assert.deepEqual(trending, [
    { name: 'logo', requests: 2 },
    { name: 'branding', requests: 1 },
    { name: 'design', requests: 1 },
  ]);
});
