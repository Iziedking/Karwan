import { test } from 'node:test';
import assert from 'node:assert/strict';

/// The guide keeps up with what shipped in the Canteen window (to 16 Oct 2026).
/// Each test names a behaviour the assistant would otherwise describe wrongly
/// or not at all.
///
///   npx tsx --test src/assistant/guideCurrency.test.ts

const { PLATFORM_GUIDE, GUIDE_REVIEWED_AT } = await import('./platformGuide.js');
const entry = (id: string) => {
  const found = PLATFORM_GUIDE.find((e) => e.id === id);
  assert.ok(found, `guide entry ${id}`);
  return found;
};

test('the guide was reviewed after the Canteen window features shipped', () => {
  assert.ok(GUIDE_REVIEWED_AT >= '2026-10-16', GUIDE_REVIEWED_AT);
});

test('the shortlist is on for testnet and both sides check each other', () => {
  const shortlist = entry('shortlist');
  assert.equal(shortlist.status, 'testnet');
  assert.equal(shortlist.mainnet, 'off');
  // The seller's agent reads the buyer before it bids, and can pass.
  assert.match(shortlist.summary, /seller's agent/i);
  assert.match(shortlist.summary, /before it bids/i);
  assert.match(shortlist.summary, /passes on a buyer/i);
});

test('World ID on agent deals is described with its triggers and who confirms when', () => {
  const world = entry('world');
  assert.match(world.summary, /agent deal/i);
  assert.match(world.summary, /first deal/i);
  assert.match(world.summary, /1,000 USDC/);
  assert.match(world.summary, /buyer confirms when choosing/i);
  assert.match(world.summary, /seller confirms before escrow funds/i);
  // A price outlier or a low score never asks, so the assistant must not say it does.
  assert.match(world.summary, /never asks/i);
});

test('the research survey has its own entry and page', () => {
  const research = entry('research');
  assert.equal(research.route, '/research');
  assert.ok(research.api.includes('POST /api/survey/research'));
});

test('the roadmap no longer calls paid record checks unbuilt, and names what is in testing', () => {
  const roadmap = PLATFORM_GUIDE.find((e) => /roadmap/.test(e.keywords) && /None of these is live today/.test(e.summary));
  assert.ok(roadmap, 'roadmap entry');
  assert.doesNotMatch(roadmap.summary, /paid data through x402/);
  assert.match(roadmap.summary, /escrow families/i);
  assert.match(roadmap.summary, /connected social accounts/i);
  assert.match(roadmap.summary, /Chainlink/);
});
