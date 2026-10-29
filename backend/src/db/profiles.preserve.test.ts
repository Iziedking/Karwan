import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// What the setup conversation saved survives a save from an older screen.
///
///   npx tsx --test src/db/profiles.preserve.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-profile-preserve-')));
delete process.env.DATABASE_URL;
const { agentPrefsOf, getProfile, upsertProfile } = await import('./profiles.js');

const base = { address: '0xbello', role: 'seller' as const, displayName: 'Bello' };
const seller = { skills: ['rice'], bio: 'Rice to shops', minBudgetUsdc: 20, maxBudgetUsdc: 40, minDeadlineDays: 1, maxDeadlineDays: 3 };

test("an older client's save keeps the setup fields", async () => {
  const setup = {
    goals: ['sell', 'business'] as Array<'sell' | 'business'>,
    agentPrefs: { findClients: false, agentMode: 'ask' as const },
    ownWords: { what: 'Rice to shops', price: '20 to 40 USDC, 3 days' },
    workPlaces: 'WhatsApp, Instagram',
    businessDraft: { name: 'Bello Foods', trades: 'rice and grains' },
  };
  await upsertProfile({ ...base, seller, ...setup });
  await upsertProfile({ ...base, seller: { ...seller, maxBudgetUsdc: 50 } });
  const saved = await getProfile('0xbello');
  assert.deepEqual(saved?.goals, setup.goals);
  assert.deepEqual(saved?.agentPrefs, setup.agentPrefs);
  assert.deepEqual(saved?.ownWords, setup.ownWords);
  assert.equal(saved?.workPlaces, setup.workPlaces);
  assert.deepEqual(saved?.businessDraft, setup.businessDraft);
  assert.equal(saved?.seller?.maxBudgetUsdc, 50);
});

test('agentPrefsOf fills the defaults an older account never stored', () => {
  assert.deepEqual(agentPrefsOf(null), { findClients: true, agentMode: 'offers', sellerPriceSet: true, buyerPriceSet: true, dismissedSuggestions: [] });
  assert.deepEqual(agentPrefsOf({ ...base, createdAt: 0, updatedAt: 0, agentPrefs: { agentMode: 'ask' } }), {
    findClients: true, agentMode: 'ask', sellerPriceSet: true, buyerPriceSet: true, dismissedSuggestions: [],
  });
});
