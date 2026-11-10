import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MESSAGES } from '@/shared/i18n/messages/all';
import { reportedListingId } from './reportedOffer';

/// The desk can take a reported offer off the market from its report.
///
///   npx tsx --test features/admin/reportedOffer.test.ts

test('a report about an offer names the offer', () => {
  assert.equal(reportedListingId('/listings/lst_5b46143c8d709089'), 'lst_5b46143c8d709089');
  assert.equal(reportedListingId('/listings/lst_5b46143c8d709089?from=market'), 'lst_5b46143c8d709089');
});

test('any other report names none', () => {
  for (const url of ['/market', '/listings', '/listings/', '/listings/../admin', '/deals/lst_5b46143c8d709089', 'https://evil.example/listings/lst_5b46143c8d709089', '', null, undefined]) {
    assert.equal(reportedListingId(url), null, String(url));
  }
});

test('the desk asks before it removes, in five languages', () => {
  for (const [locale, messages] of Object.entries(MESSAGES)) {
    const actions = messages.adminFeedbackPage.actions;
    for (const text of [actions.removeOffer, actions.confirmRemoveOffer, actions.offerRemoved]) {
      assert.ok(text.length > 3, locale);
      assert.doesNotMatch(text, /—/, locale);
    }
    assert.notEqual(actions.removeOffer, actions.confirmRemoveOffer, locale);
  }
  const page = readFileSync('app/admin/feedback/page.tsx', 'utf8');
  assert.match(page, /removal === 'idle'\) return setRemoval\('asking'\)/);
  assert.match(page, /api\.removeListingByTeam\(listingId\)/);
});
