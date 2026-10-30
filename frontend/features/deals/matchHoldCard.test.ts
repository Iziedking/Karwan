import assert from 'node:assert/strict';
import test from 'node:test';
import { en } from '@/shared/i18n/messages/en';
import { matchHoldCard } from './matchHoldCard';

///   npx tsx --test features/deals/matchHoldCard.test.ts

const copy = en.directDealDetail.terms;
const shared = 'A past delivery link from one side was flagged by the safety check. A person at Karwan looks at it. Nothing is blocked.';

test('a held match says the money is unchanged and offers a person; the copy never promises a block on release', () => {
  const card = matchHoldCard({ decision: 'hold', lines: [shared], paidConsulted: false }, copy);
  assert.ok(card);
  assert.equal(card.kind, 'hold');
  assert.equal(card.title, 'Held for a look');
  assert.match(card.body, /stays in escrow/);
  assert.match(card.body, /follows the deal/);
  assert.doesNotMatch(card.body, /nothing releases|until it clears/i);
  assert.deepEqual(card.lines, [shared]);
  assert.equal(card.ask, 'Ask a person to check');
  assert.equal(card.paidLine, null);
});

test('a flag is a note with no button, and shows only when a line is for this viewer; a cleared or passed match shows nothing', () => {
  const flag = matchHoldCard({ decision: 'flag', lines: ['Price is well above similar deals.'], paidConsulted: true }, copy);
  assert.equal(flag?.kind, 'flag');
  assert.equal(flag?.ask, null);
  assert.equal(flag?.title, 'Match flagged');
  assert.ok(flag?.paidLine);
  assert.equal(matchHoldCard({ decision: 'flag', lines: [], paidConsulted: false }, copy), null);
  assert.equal(matchHoldCard(null, copy), null);
  assert.equal(matchHoldCard(undefined, copy), null);
});
