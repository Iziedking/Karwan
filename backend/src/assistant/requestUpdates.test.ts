import assert from 'node:assert/strict';
import test from 'node:test';
import { agreedLine, agreedPick, requestUpdate, updateTurn, type RequestView, type ShortlistPick } from './requestUpdates.js';
import { noteRequestCards, rememberRequestLink, takeRequestLink } from './requestLinks.js';

/// The negotiation followed from the assistant (view 30): one line per
/// request, the newest state only, milestones and never each round.
///
///   npx tsx --test src/assistant/requestUpdates.test.ts

const JOB = '0x' + 'ab'.repeat(32);
const base: RequestView = {
  jobId: JOB,
  budgetUsdc: 100,
  agreeForMe: false,
  offers: { count: 0, lowestUsdc: null },
  shortlist: null,
  nearMiss: null,
  proposal: null,
  deal: null,
  ended: null,
};
const pick = (over: Partial<ShortlistPick>): ShortlistPick => ({
  seller: '0x' + '1'.repeat(40), name: 'Pam Collins', tag: 'pamcollins', priceUsdc: 90, recommended: false, verified: false, state: 'ready', ...over,
});
const shortlist = [
  pick({ seller: '0x' + '2'.repeat(40), name: 'Realnica', tag: 'realnica', priceUsdc: 116.06 }),
  pick({ recommended: true }),
  pick({ seller: '0x' + '3'.repeat(40), name: 'Poz', tag: null, priceUsdc: 113.32 }),
];

test('just posted: the agent is on it, and the person can leave', () => {
  const u = requestUpdate(base);
  assert.match(u.content, /^Your agent is on it/);
  assert.match(u.content, /You can close this/);
  assert.doesNotMatch(u.content, /sleep/);
  assert.match(requestUpdate({ ...base, agreeForMe: true }).content, /you can sleep, and you'll wake up to an agreed deal here, ready for one tap/);
});

test('offers coming in: a count and the lowest price, still negotiating', () => {
  assert.match(requestUpdate({ ...base, offers: { count: 7, lowestUsdc: 90 } }).content, /^7 offers are in, from 90 USDC\. Your agent is still negotiating/);
});

test('the shortlist: how many, from how much, who the agent recommends, and one card to choose', () => {
  const u = requestUpdate({ ...base, offers: { count: 3, lowestUsdc: 90 }, shortlist });
  assert.equal(u.content, 'Your shortlist is ready: 3 offers, from 90 USDC. Your agent recommends @pamcollins at 90 USDC.');
  assert.deepEqual(u.cards.map((c) => c.kind), ['choose', 'request']);
});

test('agree for me: an agreed deal within budget, waiting for one tap', () => {
  const u = requestUpdate({ ...base, agreeForMe: true, shortlist });
  assert.match(u.content, /^Agreed for you: your agent agreed 90 USDC with @pamcollins, the seller it recommends, within your budget of 100 USDC\. Tap to lock the money/);
  assert.equal(u.cards[0]?.kind, 'choose');
});

test('agree for me never agrees above budget; the person chooses instead', () => {
  const over = shortlist.map((e) => (e.recommended ? { ...e, priceUsdc: 116 } : e));
  assert.match(requestUpdate({ ...base, agreeForMe: true, shortlist: over }).content, /^Your shortlist is ready/);
  assert.equal(agreedPick(over, 100), null);
  assert.equal(agreedPick(shortlist, 100)?.tag, 'pamcollins');
  assert.equal(agreedPick(shortlist.map((e) => ({ ...e, state: 'negotiating' as const })), 100), null);
  assert.match(agreedLine(shortlist[1]!), /^\*Agreed for you\.\* Your agent agreed 90 USDC with @pamcollins/);
});

test('a near match speaks only when nothing fits and no shortlist is ready', () => {
  const nm = { proceedPriceUsdc: 198, gapUsdc: 98 };
  assert.match(requestUpdate({ ...base, nearMiss: nm }).content, /^Near match: 198 USDC, 98 USDC above your budget, and nothing within budget so far/);
  assert.match(requestUpdate({ ...base, nearMiss: nm, shortlist }).content, /^Your shortlist is ready/);
});

test('later steps win: agreed, money locked, delivered, settled', () => {
  const agreed = requestUpdate({ ...base, shortlist, proposal: { priceUsdc: 90, counterparty: '@pamcollins', awaitingBuyer: true, deadlineUnix: 1_800_000_000 } });
  assert.match(agreed.content, /^Your agent agreed 90 USDC with @pamcollins\. Approve to lock the money/);
  assert.equal(agreed.cards[0]?.kind, 'approve');
  const deal = { amountUsdc: 90, counterparty: '@pamcollins', funded: true, delivered: false, settled: false };
  assert.match(requestUpdate({ ...base, deal }).content, /^90 USDC is locked in escrow with @pamcollins/);
  assert.match(requestUpdate({ ...base, deal: { ...deal, delivered: true } }).content, /^@pamcollins delivered\. Review the work/);
  assert.match(requestUpdate({ ...base, deal: { ...deal, settled: true } }).content, /^Done: your deal with @pamcollins settled\./);
  assert.match(requestUpdate({ ...base, ended: 'expired' }).content, /deadline without a deal/);
});

test('the turn is marked live and drops a card that cannot be built', () => {
  const turn = updateTurn(JOB, requestUpdate({ ...base, shortlist }), {
    choose: () => ({ error: 'no' }),
    approve: () => ({ error: 'no' }),
    request: (jobId) => ({ kind: 'navigate', id: jobId, label: 'Open the request', href: `/jobs/${jobId}` }) as never,
    deal: () => ({ error: 'no' }),
  });
  assert.equal(turn.live, true);
  assert.equal(turn.actions.length, 1);
});

test('a request card remembers its conversation and Agree for me until the request is posted, once', () => {
  const me = '0x' + 'a'.repeat(40);
  noteRequestCards(me, 'conv-1', [
    { kind: 'confirm', intent: 'post_request', payload: { brief: 'Logo for my bakery', budgetUsdc: 100, agreeForMe: true } },
    { kind: 'confirm', intent: 'post_offer', payload: { brief: 'x', budgetUsdc: 1 } },
  ]);
  assert.deepEqual(
    (({ conversationId, agreeForMe }) => ({ conversationId, agreeForMe }))(takeRequestLink(me.toUpperCase().replace('0X', '0x'), ' Logo for my bakery ', 100)!),
    { conversationId: 'conv-1', agreeForMe: true },
  );
  assert.equal(takeRequestLink(me, 'Logo for my bakery', 100), null);
  rememberRequestLink(me, 'Old', 5, { conversationId: 'c', agreeForMe: false }, 0);
  assert.equal(takeRequestLink(me, 'Old', 5, 2 * 60 * 60 * 1000), null);
});
