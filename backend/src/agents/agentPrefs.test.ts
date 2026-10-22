import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentWallets } from '../db/agentWallets.js';
import type { UserProfile } from '../db/profiles.js';
import { joinsMarket, toSellerProfile } from './agent-registry.js';
import { alreadySuggested, paysForResearch, shouldSuggest, suggestionEvent, suggestionKey } from './suggestion.js';
import type { KarwanEvent } from '../events.js';

/// What the setup answers change in the selling agent (view 19): "Find clients
/// for me" puts it on the market or keeps it off, and "Ask me first" makes it
/// suggest a request to its owner instead of offering.
///
///   npx tsx --test src/agents/agentPrefs.test.ts

const agents = { userAddress: '0xowner', sellerAddress: '0xsellagent', sellerWalletId: 'w1' } as unknown as AgentWallets;
const profile = (agentPrefs?: UserProfile['agentPrefs']) =>
  ({
    address: '0xowner', role: 'seller', displayName: 'Ada', createdAt: 0, updatedAt: 0,
    seller: { skills: ['logo'], bio: '', minBudgetUsdc: 20, maxBudgetUsdc: 40, minDeadlineDays: 1, maxDeadlineDays: 3, keywords: ['logo'] },
    ...(agentPrefs ? { agentPrefs } : {}),
  }) as unknown as UserProfile;

test('the market sweep leaves out someone who said they have their own clients only', () => {
  assert.equal(joinsMarket(profile()), true);
  assert.equal(joinsMarket(profile({ findClients: true })), true);
  assert.equal(joinsMarket(profile({ findClients: false })), false);
});

test('the seller profile carries how much the agent may do on its own', () => {
  assert.equal(toSellerProfile(agents, profile())?.agentMode, 'offers');
  assert.equal(toSellerProfile(agents, profile({ agentMode: 'ask' }))?.agentMode, 'ask');
  // A seller off the market still resolves, so its live deals keep working.
  assert.ok(toSellerProfile(agents, profile({ findClients: false })));
});

test('offers bids; ask me first suggests once per request, then stays quiet', () => {
  assert.equal(shouldSuggest('offers', false), 'bid');
  assert.equal(shouldSuggest('offers', true), 'bid');
  assert.equal(shouldSuggest('ask', false), 'suggest');
  assert.equal(shouldSuggest('ask', true), 'skip');
});

test('a suggestion names its owner and request in the payload only, so the buyer never sees it', () => {
  const e = suggestionEvent({ sellerUser: '0xOWNER', jobId: '0xJob', priceUsdc: '35.00', title: 'Logo for a bakery' });
  assert.equal(e.type, 'agent.suggestion');
  assert.equal('jobId' in e, false);
  assert.deepEqual(e.payload, { sellerUser: '0xowner', jobId: '0xjob', priceUsdc: '35.00', title: 'Logo for a bakery' });
});

test('a suggestion already in the history is not sent again after a restart', () => {
  const history = [
    { type: 'agent.suggestion', actor: 'seller', ts: 1, payload: { sellerUser: '0xowner', jobId: '0xjob' } },
    { type: 'agent.suggestion', actor: 'seller', ts: 2, payload: { sellerUser: '0xother', jobId: '0xjob2' } },
  ] as unknown as KarwanEvent[];
  assert.equal(alreadySuggested(history, '0xJOB', '0xOwner'), true);
  assert.equal(alreadySuggested(history, '0xjob2', '0xowner'), false);
});

test('ask me first pays for no market research: the suggestion prices on what is cached', () => {
  assert.equal(paysForResearch('offers'), true);
  assert.equal(paysForResearch('ask'), false);
});

test('the durable suggestion record is keyed by owner and request, whatever the case', () => {
  assert.equal(suggestionKey('0xOWNER', '0xJob'), '0xowner|0xjob');
});
