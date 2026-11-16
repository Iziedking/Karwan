import assert from 'node:assert/strict';
import test from 'node:test';
import type { KarwanEvent } from '../events.js';
import { MOMENT_MAX_AGE_MS, momentFor, pickMoment, type MomentContext } from './moments.js';

/// A moment is one notable thing on the account, said once with a face that
/// fits it (view 57, 15 Nov evening).

const ME = '0xme00000000000000000000000000000000000001';
const NOW = Date.UTC(2026, 10, 15, 12);
const ev = (type: string, payload: Record<string, unknown> = {}, over: Partial<KarwanEvent> = {}): KarwanEvent =>
  ({ type, actor: 'platform', ts: NOW - 1000, jobId: '0xdeal', payload, ...over }) as KarwanEvent;
const seller: MomentContext = { me: ME, role: 'seller' };
const buyer: MomentContext = { me: ME, role: 'buyer' };

test('money arriving and a deal paid out make Aman excited', () => {
  assert.deepEqual(momentFor(ev('escrow.seller.paid', { sellerMicros: '120000000' }), seller), {
    id: `escrow.seller.paid:0xdeal:${NOW - 1000}`, at: NOW - 1000, mood: 'excited', line: 'paid', href: '/deals/0xdeal', amountUsdc: '120',
  });
  assert.equal(momentFor(ev('escrow.settled'), seller)?.line, 'paid');
  assert.equal(momentFor(ev('escrow.settled'), buyer), null);
  const credit = momentFor(ev('wallet.credited', { address: ME, amountUsdc: '25' }, { jobId: undefined }), { me: ME, role: null });
  assert.equal(credit?.mood, 'excited');
  assert.equal(credit?.href, '/activity');
  assert.equal(momentFor(ev('wallet.credited', { address: ME, amountUsdc: '0.5' }, { jobId: undefined }), { me: ME, role: null }), null);
  assert.equal(momentFor(ev('deal.delivery.cleared'), seller)?.line, 'released');
  assert.equal(momentFor(ev('reputation.tier-up', { address: ME, toTier: 'STRONG' }, { jobId: undefined }), { me: ME, role: null })?.line, 'tier');
});

test('a deal or request that is lost makes Aman sad, and a missed deadline too', () => {
  assert.equal(momentFor(ev('deal.cancelled'), buyer)?.mood, 'sad');
  assert.equal(momentFor(ev('deal.acceptance.expired'), seller)?.line, 'lapsed');
  assert.equal(momentFor(ev('job.expired', { buyer: ME }, { jobId: '0xjob' }), { me: ME, role: null })?.href, '/jobs/0xjob');
  assert.equal(momentFor(ev('offer.withdrawn', { offerId: 'o1' }, { jobId: '0xjob' }), { me: ME, role: null, ownsRequest: true })?.line, 'lapsed');
  assert.equal(momentFor(ev('offer.withdrawn', { offerId: 'o1' }, { jobId: '0xjob' }), { me: ME, role: null }), null);
  assert.equal(momentFor(ev('deal.match.declined', { seller: ME, buyer: '0xb' }), { me: ME, role: null })?.mood, 'sad');
  assert.equal(momentFor(ev('deal.deadline.passed'), seller)?.line, 'late');
});

test('a ruling that pays the buyer from the seller\'s pocket hurts, and nothing else does', () => {
  const backed = { me: ME, role: 'seller' as const, deal: { guaranteeBackedAt: 1, resolvedSellerBps: 4000 } };
  assert.equal(momentFor(ev('escrow.resolved'), backed)?.mood, 'hurt');
  assert.equal(momentFor(ev('escrow.resolved'), backed)?.line, 'pocketPaid');
  assert.equal(momentFor(ev('escrow.resolved'), { ...backed, deal: { resolvedSellerBps: 4000 } }), null);
  assert.equal(momentFor(ev('escrow.resolved'), { ...backed, deal: { guaranteeBackedAt: 1, resolvedSellerBps: 10000 } }), null);
  assert.equal(momentFor(ev('escrow.resolved'), { ...backed, role: 'buyer' }), null);
  assert.equal(momentFor(ev('chat.message'), seller), null);
});

test('the newest moment since the last one shown, and none older than two days', () => {
  assert.equal(MOMENT_MAX_AGE_MS, 48 * 3600_000);
  const older = { event: ev('deal.cancelled', {}, { ts: NOW - 5000 }), ctx: buyer };
  const newer = { event: ev('escrow.seller.paid', { sellerMicros: '1000000' }, { ts: NOW - 2000 }), ctx: seller };
  const quiet = { event: ev('chat.message', {}, { ts: NOW - 100 }), ctx: seller };
  assert.equal(pickMoment([older, newer, quiet], 0, NOW)?.mood, 'excited');
  assert.equal(pickMoment([older, newer], NOW - 2000, NOW), null);
  assert.equal(pickMoment([older], NOW - 6000, NOW)?.mood, 'sad');
  const stale = { event: ev('deal.cancelled', {}, { ts: NOW - 49 * 3600_000 }), ctx: buyer };
  assert.equal(pickMoment([stale], 0, NOW), null);
});

test('an offer on their own request and a new contest entry make Aman glad (owner, 16 Nov 2026)', () => {
  const own: MomentContext = { me: ME, role: null, ownsRequest: true };
  assert.deepEqual(
    [momentFor(ev('bid.submitted', {}, { jobId: '0xjob' }), own)?.line, momentFor(ev('offer.created', {}, { jobId: '0xjob' }), own)?.href],
    ['offer', '/jobs/0xjob'],
  );
  assert.equal(momentFor(ev('bid.submitted', {}, { jobId: '0xjob' }), { me: ME, role: null }), null, 'a request of someone else says nothing');
  const entry = momentFor(ev('contest.entered', { contestId: 'c_1', buyer: ME, replaced: false }, { jobId: undefined }), { me: ME, role: null });
  assert.equal(entry?.line, 'entry');
  assert.equal(entry?.href, '/contests/c_1');
  assert.equal(momentFor(ev('contest.entered', { contestId: 'c_1', buyer: ME, replaced: true }, { jobId: undefined }), { me: ME, role: null }), null, 'a replaced entry is not news');
  assert.equal(momentFor(ev('contest.entered', { contestId: 'c_1', buyer: '0xsomeoneelse', replaced: false }, { jobId: undefined }), { me: ME, role: null }), null);
});
