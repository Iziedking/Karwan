import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('partners is a tab of Discover: same title, nav, search and filter bar', () => {
  const source = read('./PartnersBrowse.tsx');
  assert.match(source, /<DiscoveryNav active="partners" tone="light" appearance="quiet" \/>/);
  assert.match(source, /text-\[36px\] font-medium[^"]*sm:text-\[40px\]/);
  assert.match(source, /<SortMenu/);
  assert.doesNotMatch(source, /SectionTag|GridOverlay|tone="dark"/);
  const shared = read('../../discovery/components/FilterBar.tsx');
  assert.match(shared, /export function SortMenu/);
  assert.match(read('../../listings/components/ListingsBrowse.tsx'), /from '@\/features\/discovery\/components\/FilterBar'/);
});

test('a business is a quiet card: verified says why in a tooltip once, no numbering, no outside-link arrow', () => {
  const source = read('./PartnersBrowse.tsx');
  assert.match(source, /rounded-\[20px\] border border-\[var\(--lp-border-light\)\] bg-\[var\(--lp-card\)\]/);
  assert.match(source, /<Hint[^>]*>\{copy\.identityNote\}<\/Hint>/);
  assert.doesNotMatch(source, /padStart\(2, '0'\)/);
  assert.doesNotMatch(source, /↗|→/);
  assert.match(source, /listedAmount\(partner\.minOrderValue\)/);
  assert.match(source, /copy\.viewTrustProfile/);
});
