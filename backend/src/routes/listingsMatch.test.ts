import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-listing-match-')));
delete process.env.DATABASE_URL;

const { buildListingMatchPrompt, matchDecisionSchema } = await import('./listings.js');

const listing = { title: 'Four-email onboarding sequence for developers', description: 'I write a four-email sequence that onboards developers to your API.', askingPriceUsdc: '80' } as never;
const job = { briefText: 'Backend engineer to build an API service', budgetUsdc: '120', termsHash: '0x' };

test('the matcher names what each side needs and delivers before it decides', () => {
  const keys = Object.keys(matchDecisionSchema.shape);
  assert.deepEqual(keys.slice(0, 2), ['briefNeeds', 'listingDelivers'], 'the deliverables come before the verdict');
  assert.ok(keys.indexOf('match') > keys.indexOf('listingDelivers'));
  const ok = matchDecisionSchema.safeParse({ match: true, confidence: 0.9, reasoning: 'same deliverable' });
  assert.equal(ok.success, true, 'a model that skips the deliverable fields still parses');
});

test('sharing a field or an audience is not a match; the listing must deliver what the request asks for', () => {
  const prompt = buildListingMatchPrompt(listing, job);
  assert.match(prompt, /deliver the thing the brief asks for/i);
  assert.match(prompt, /shares a field, an audience or a keyword/i);
  assert.match(prompt, /email sequence for developers does not fulfill a request for a backend engineer/i);
  // Listings are posted from the selling side, so a request-shaped listing is the rare case, not the default.
  assert.doesNotMatch(prompt, /apply FIRST/);
});
